import { ConvexError, v } from "convex/values";
import { Presence } from "@convex-dev/presence";
import { components } from "./_generated/api";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCanvasAccess, requireAuth } from "./lib/auth";
import errors from "./config/errorsConfig";
import { parsePresenceUserId } from "./lib/presenceIds";
import {
  MAX_PUBLISHED_NODE_IDS,
  type CanvasPresenceData,
} from "./lib/presenceData";
import { resolveUserDisplayName } from "./lib/userDisplayName";

// Présence sur un canvas : qui l'a ouvert en ce moment.
//
// Une room par canvas (`roomId` = id du canvas), un participant par onglet
// (cf. lib/presenceIds.ts). `heartbeat`, `list` et `disconnect` implémentent l'interface
// `PresenceAPI` attendue par le hook `usePresence` d'`@convex-dev/presence`,
// d'où leurs signatures imposées — et le nom de module : sur fermeture
// d'onglet, le hook envoie `presence:disconnect` en dur via `sendBeacon`.
//
// Réservé aux MEMBRES du canvas (propriétaire et partages). Un visiteur d'un
// canvas public n'y entre pas : il verrait sinon les noms et avatars des
// collaborateurs. Le client ne monte la présence que pour un membre
// (`_isMember` de `canvases.readCanvas`).

const presence = new Presence(components.presence);

// Bornes du heartbeat accepté : le client choisit l'intervalle, et le
// composant en déduit l'échéance de déconnexion (2,5 × l'intervalle). Sans
// borne, un client pourrait rester « en ligne » indéfiniment.
const MIN_INTERVAL_MS = 5_000;
const MAX_INTERVAL_MS = 60_000;

const presenceStateValidator = v.object({
  userId: v.string(),
  online: v.boolean(),
  lastDisconnected: v.number(),
  data: v.optional(v.any()),
  name: v.optional(v.string()),
  image: v.optional(v.string()),
});

/**
 * L'appelant est bien celui que désigne l'id de présence, et membre du canvas
 * de la room. L'identité vient de l'auth, jamais du client.
 */
async function requireRoomParticipant(
  ctx: MutationCtx,
  roomId: string,
  presenceUserId: string,
) {
  const authUserId = await requireAuth(ctx);
  if (parsePresenceUserId(presenceUserId) !== authUserId) {
    throw new ConvexError(errors.UNAUTHORIZED_USER);
  }

  const canvasId = ctx.db.normalizeId("canvases", roomId);
  if (!canvasId) throw new ConvexError(errors.CANVAS_NOT_FOUND);
  const access = await getCanvasAccess(ctx, canvasId, authUserId);
  if (!access) throw new ConvexError(errors.CANVAS_NOT_FOUND);
}

export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  returns: v.object({ roomToken: v.string(), sessionToken: v.string() }),
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    await requireRoomParticipant(ctx, roomId, userId);

    const boundedInterval = Math.min(
      Math.max(interval, MIN_INTERVAL_MS),
      MAX_INTERVAL_MS,
    );
    return await presence.heartbeat(
      ctx,
      roomId,
      userId,
      sessionId,
      boundedInterval,
    );
  },
});

// Une ligne de présence hors ligne depuis plus longtemps est supprimée par
// `pruneRoom`. Assez long pour qu'un rechargement ou une coupure réseau
// retrouve sa ligne (et ses données) ; assez court pour que la table ne
// garde pas la trace de chaque onglet jamais ouvert.
const STALE_OFFLINE_MS = 5 * 60_000;
// Lignes examinées par passage : les en-ligne d'abord, puis les hors-ligne
// des plus récentes aux plus anciennes (ordre du composant). Une room très
// encombrée se vide en quelques arrivées.
const PRUNE_SCAN_LIMIT = 200;

/**
 * Supprime les participants hors ligne depuis longtemps dans la room.
 *
 * Le composant passe un participant hors ligne à sa déconnexion mais ne
 * supprime jamais sa ligne. Comme il y a un participant par onglet (cf.
 * lib/presenceIds.ts), chaque canvas ouvert en laisserait une, pour toujours :
 * la table grossirait sans fin et `list` en renverrait jusqu'à sa limite.
 *
 * Appelée une fois par le client à son arrivée dans la room, pas à chaque
 * heartbeat : elle lit toute la room, et la relire toutes les dix secondes
 * par onglet ferait entrer les heartbeats en conflit avec chaque
 * publication d'activité.
 */
export const pruneRoom = mutation({
  args: { roomId: v.string(), userId: v.string() },
  returns: v.number(),
  handler: async (ctx, { roomId, userId }) => {
    await requireRoomParticipant(ctx, roomId, userId);

    const cutoff = Date.now() - STALE_OFFLINE_MS;
    const participants = await presence.listRoom(
      ctx,
      roomId,
      false,
      PRUNE_SCAN_LIMIT,
    );
    let removed = 0;
    for (const participant of participants) {
      if (participant.online || participant.lastDisconnected >= cutoff) {
        continue;
      }
      await presence.removeRoomUser(ctx, roomId, participant.userId);
      removed++;
    }
    return removed;
  },
});

/**
 * Publie les nodes sur lesquels ce participant (cet onglet) est actif :
 * sélectionnés sur le canvas, ou ouverts en window. Les deux listes ensemble,
 * puisque `data` est remplacé en bloc. Hors de l'interface du hook : le
 * client l'appelle lui-même, quand l'une change.
 */
export const updateActivity = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    selectedNodeIds: v.array(v.string()),
    openNodeIds: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { roomId, userId, selectedNodeIds, openNodeIds }) => {
    await requireRoomParticipant(ctx, roomId, userId);

    const data: CanvasPresenceData = {
      selectedNodeIds: selectedNodeIds.slice(0, MAX_PUBLISHED_NODE_IDS),
      openNodeIds: openNodeIds.slice(0, MAX_PUBLISHED_NODE_IDS),
    };
    await presence.updateRoomUser(ctx, roomId, userId, data);
    return null;
  },
});

type Profile = { name?: string; image?: string };

/**
 * Nom et avatar de ces utilisateurs (ids `users`, en chaîne), une lecture par
 * utilisateur même s'il revient plusieurs fois. Clé : l'id `users`.
 */
async function loadProfiles(
  ctx: QueryCtx,
  rawUserIds: Iterable<string>,
): Promise<Map<string, Profile>> {
  const profiles = new Map<string, Profile>();
  for (const rawUserId of rawUserIds) {
    if (profiles.has(rawUserId)) continue;
    const userId = ctx.db.normalizeId("users", rawUserId);
    const user = userId ? await ctx.db.get(userId as Id<"users">) : null;
    const name = resolveUserDisplayName(user);
    profiles.set(rawUserId, {
      ...(name ? { name } : {}),
      ...(user?.image ? { image: user.image } : {}),
    });
  }
  return profiles;
}

// Pas de contrôle d'auth ici, comme le recommande le composant : le
// `roomToken` n'est délivré que par `heartbeat`, qui vérifie l'appartenance,
// et une query sans lecture propre à l'appelant est partagée en cache par
// tous les abonnés de la room.
export const list = query({
  args: { roomToken: v.string() },
  returns: v.array(presenceStateValidator),
  handler: async (ctx, { roomToken }) => {
    const states = await presence.list(ctx, roomToken);

    // Un utilisateur ouvert dans plusieurs onglets apparaît plusieurs fois.
    const profiles = await loadProfiles(
      ctx,
      states.flatMap((state) => parsePresenceUserId(state.userId) ?? []),
    );

    return states.map((state) => {
      const rawUserId = parsePresenceUserId(state.userId);
      const profile = rawUserId ? profiles.get(rawUserId) : undefined;
      return {
        userId: state.userId,
        online: state.online,
        lastDisconnected: state.lastDisconnected,
        ...(state.data !== undefined ? { data: state.data } : {}),
        ...profile,
      };
    });
  },
});

// Au-delà, on n'affiche de toute façon que « +N » sur la carte du canvas.
const HOME_ROOM_LIMIT = 20;

/**
 * Pour la home : sur chacun de MES canvas (les miens et ceux partagés avec
 * moi), les AUTRES membres en ligne en ce moment. Seuls les canvas où il y a
 * quelqu'un sont renvoyés.
 *
 * Lecture par room via le composant plutôt que par `roomToken` : les canvas
 * sont ceux dont l'appelant est membre, l'accès est donc vérifié par
 * construction. Rejouée quand la présence d'une de ces rooms change, ce qui
 * comprend la publication d'une sélection : quelques lectures par canvas.
 */
export const listMyCanvases = query({
  args: {},
  returns: v.array(
    v.object({
      canvasId: v.id("canvases"),
      collaborators: v.array(
        v.object({
          userId: v.string(),
          name: v.optional(v.string()),
          image: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx) => {
    const authUserId = await requireAuth(ctx);

    const own = await ctx.db
      .query("canvases")
      .withIndex("by_creator", (q) => q.eq("creatorId", authUserId))
      .collect();
    const shares = await ctx.db
      .query("shares")
      .withIndex("by_user", (q) => q.eq("userId", authUserId))
      .collect();
    // Mes canvas non partagés n'ont personne d'autre que moi : la présence
    // n'y est même pas montée (cf. CanvasPresenceSync). Un `first()` indexé
    // par canvas plutôt qu'une lecture de room inutile.
    const ownShared = await Promise.all(
      own.map(async (canvas) => {
        const share = await ctx.db
          .query("shares")
          .withIndex("by_canvas", (q) => q.eq("canvasId", canvas._id))
          .first();
        return share ? canvas._id : null;
      }),
    );
    const canvasIds = [
      ...ownShared.filter((id) => id !== null),
      ...shares
        .filter((share) => share.resourceType === "canvas")
        .map((share) => share.canvasId),
    ];

    const rooms = await Promise.all(
      canvasIds.map(async (canvasId) => {
        const online = await presence.listRoom(
          ctx,
          canvasId,
          true,
          HOME_ROOM_LIMIT,
        );
        // Les autres seulement, une fois par utilisateur (un par onglet côté
        // présence).
        const others = new Set<string>();
        for (const { userId } of online) {
          const rawUserId = parsePresenceUserId(userId);
          if (rawUserId && rawUserId !== authUserId) others.add(rawUserId);
        }
        return { canvasId, userIds: [...others] };
      }),
    );

    const present = rooms.filter((room) => room.userIds.length > 0);
    const profiles = await loadProfiles(
      ctx,
      present.flatMap((room) => room.userIds),
    );
    return present.map((room) => ({
      canvasId: room.canvasId,
      collaborators: room.userIds.map((userId) => ({
        userId,
        ...profiles.get(userId),
      })),
    }));
  },
});

// Pas d'auth possible : appelée par `sendBeacon` à la fermeture de l'onglet.
// Le `sessionToken` ne sert qu'à déconnecter la session qu'il désigne.
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionToken }) => {
    await presence.disconnect(ctx, sessionToken);
    return null;
  },
});
