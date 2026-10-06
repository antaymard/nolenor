import { v } from "convex/values";

/**
 * Une demande envoyée sans thread (l'omnibar) et son aiguillage : vers quel
 * thread elle est partie, et pourquoi (cf. harness/dispatch.ts).
 *
 * `routing` le temps de la décision (quelques centaines de ms), puis
 * `routed`. L'UI affiche une carte provisoire pendant `routing`, puis « ajouté
 * à … » avec la possibilité de corriger.
 */
const dispatchStatuses = {
  routing: "routing",
  routed: "routed",
  failed: "failed",
} as const;

const dispatchDecisionValidator = v.object({
  // Où la demande est partie dans le thread choisi : steer d'un run en cours,
  // réponse à sa question, reprise d'un thread au repos, ou nouveau thread.
  kind: v.union(
    v.literal("new"),
    v.literal("steer"),
    v.literal("answer"),
    v.literal("continue"),
  ),
  // `router` : le routeur a choisi. Les autres : choix sans routeur, ou repli
  // sur un nouveau thread.
  reason: v.union(
    v.literal("router"),
    v.literal("no_candidates"),
    v.literal("low_confidence"),
    v.literal("router_error"),
    v.literal("forced_new"),
  ),
  confidence: v.optional(v.number()),
});

const dispatchesValidator = v.object({
  canvasId: v.id("canvases"),
  userId: v.id("users"),
  profile: v.string(),
  status: v.union(
    v.literal(dispatchStatuses.routing),
    v.literal(dispatchStatuses.routed),
    v.literal(dispatchStatuses.failed),
  ),
  // Ce que submitToThread recevra une fois le thread choisi.
  prompt: v.string(),
  content: v.string(),
  input: v.any(),
  model: v.optional(v.string()),
  attachments: v.optional(v.any()),
  // Nodes joints ou mentionnés : le premier indice du sujet.
  nodeIds: v.array(v.string()),
  // Pas de routeur : toujours un nouveau thread (« Start a new task instead »).
  forceNew: v.optional(v.boolean()),
  threadId: v.optional(v.string()),
  decision: v.optional(dispatchDecisionValidator),
  error: v.optional(v.string()),
});

export { dispatchesValidator, dispatchStatuses, dispatchDecisionValidator };
