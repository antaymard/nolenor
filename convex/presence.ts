import { ConvexError, v } from "convex/values";
import { Presence } from "@convex-dev/presence";
import { components } from "./_generated/api";
import { mutation, query, type MutationCtx } from "./_generated/server";
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

// Pas de contrôle d'auth ici, comme le recommande le composant : le
// `roomToken` n'est délivré que par `heartbeat`, qui vérifie l'appartenance,
// et une query sans lecture propre à l'appelant est partagée en cache par
// tous les abonnés de la room.
export const list = query({
  args: { roomToken: v.string() },
  returns: v.array(presenceStateValidator),
  handler: async (ctx, { roomToken }) => {
    const states = await presence.list(ctx, roomToken);

    // Un utilisateur ouvert dans plusieurs onglets apparaît plusieurs fois :
    // une seule lecture de `users` par utilisateur réel.
    const profiles = new Map<string, { name?: string; image?: string }>();
    for (const state of states) {
      const rawUserId = parsePresenceUserId(state.userId);
      if (!rawUserId || profiles.has(rawUserId)) continue;
      const userId = ctx.db.normalizeId("users", rawUserId);
      const user = userId ? await ctx.db.get(userId as Id<"users">) : null;
      const name = resolveUserDisplayName(user);
      profiles.set(rawUserId, {
        ...(name ? { name } : {}),
        ...(user?.image ? { image: user.image } : {}),
      });
    }

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
