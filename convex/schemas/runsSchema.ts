import { v } from "convex/values";
import {
  threadLastActivityValidator,
  threadNodeTouchValidator,
  threadRunStatusValidator,
} from "./threadMetadataSchema";

/**
 * Un run d'agent, vu comme une tâche : ce que l'utilisateur a demandé, où en
 * est le travail, ce qu'il a touché, et s'il a été relu.
 *
 * Depuis l'aiguillage (cf. harness/dispatch.ts), un thread n'est plus une
 * tâche : c'est un sujet, qui reçoit plusieurs demandes au fil du temps. La
 * tâche, c'est le run — une demande et les précisions qui y entrent en steer.
 * Le dock montre donc des runs, et le thread n'est plus que leur contexte.
 *
 * Écrit par la harness aux transitions du run (cf. harness/tasks.ts), par les
 * wrappers de nodes pour `touchedNodes`, et par la revue.
 */
const runsValidator = v.object({
  threadId: v.string(),
  // Le message qui a ouvert le run : son identifiant dans la harness.
  runMessageId: v.string(),
  canvasId: v.id("canvases"),
  userId: v.id("users"),
  // Les sous-agents ont leurs runs aussi ; le dock ne montre que Nolë.
  agentName: v.string(),
  // Ce que l'utilisateur a demandé, tel qu'il l'a tapé (tronqué).
  request: v.string(),
  status: threadRunStatusValidator,
  startedAt: v.number(),
  endedAt: v.optional(v.number()),
  error: v.optional(v.string()),
  lastActivity: v.optional(threadLastActivityValidator),
  // Les nodes écrits PENDANT ce run, pas ceux de tout le thread.
  touchedNodes: v.optional(v.array(threadNodeTouchValidator)),
  reviewedAt: v.optional(v.number()),
});

export { runsValidator };
