import { v } from "convex/values";

const messageMetadataValidator = v.object({
  messageId: v.string(),
  threadId: v.string(),
  userId: v.id("users"),
  role: v.union(v.literal("user"), v.literal("assistant")),
  agentName: v.optional(v.string()),

  // assistant only (filled after the stream completes, one row per turn)
  model: v.optional(v.string()),
  provider: v.optional(v.string()),
  usage: v.optional(v.record(v.string(), v.any())),
  // Fenêtre de contexte occupée à la fin du tour, en tokens.
  //
  // Stocké à part, et surtout PAS dérivé de `usage` : celui-ci porte
  // `result.totalUsage`, la SOMME des steps du tour. Chaque step renvoie au
  // modèle toute la conversation, donc sur un tour de 25 steps cette somme vaut
  // une vingtaine de fois le contexte réel — et elle rétrécit dès que le tour
  // suivant tient en un step. C'était exactement le compteur faux du badge.
  //
  // Ce champ-ci vient du DERNIER step (`result.usage`), dont l'entrée est la
  // conversation entière et la sortie la réponse finale : input + output y est
  // bien l'occupation de la fenêtre à la fin du tour.
  contextTokens: v.optional(v.number()),
  costUsd: v.optional(v.number()),
  // Turn index (matches UIMessage.order); used to join metadata to the
  // visible assistant message on the frontend.
  order: v.optional(v.number()),

  // user only (filled by saveMessage)
  attachments: v.optional(
    v.object({
      nodes: v.optional(
        v.array(
          v.object({
            id: v.string(),
            type: v.string(),
            title: v.string(),
          }),
        ),
      ),
      position: v.optional(v.object({ x: v.number(), y: v.number() })),
    }),
  ),
});

export { messageMetadataValidator };
