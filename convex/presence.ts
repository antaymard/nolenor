import { ConvexError, v } from "convex/values";
import { Presence } from "@convex-dev/presence";
import { components } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { getCanvasAccess, requireAuth } from "./lib/auth";
import errors from "./config/errorsConfig";
import { parsePresenceUserId } from "./lib/presenceIds";
import { resolveUserDisplayName } from "./lib/userDisplayName";

// Présence sur un canvas : qui l'a ouvert en ce moment.
//
// Une room par canvas (`roomId` = id du canvas), un participant par onglet
// (cf. lib/presenceIds.ts). Ces trois fonctions implémentent l'interface
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

export const heartbeat = mutation({
  args: {
    roomId: v.string(),
    userId: v.string(),
    sessionId: v.string(),
    interval: v.number(),
  },
  returns: v.object({ roomToken: v.string(), sessionToken: v.string() }),
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    const authUserId = await requireAuth(ctx);

    // L'identité vient de l'auth, jamais du client : l'id de présence doit
    // porter l'utilisateur authentifié.
    if (parsePresenceUserId(userId) !== authUserId) {
      throw new ConvexError(errors.UNAUTHORIZED_USER);
    }

    const canvasId = ctx.db.normalizeId("canvases", roomId);
    if (!canvasId) throw new ConvexError(errors.CANVAS_NOT_FOUND);
    const access = await getCanvasAccess(ctx, canvasId, authUserId);
    if (!access) throw new ConvexError(errors.CANVAS_NOT_FOUND);

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
