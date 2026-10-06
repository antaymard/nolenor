import { v } from "convex/values";

/**
 * Un message envoyé pendant qu'un run travaille : il attend sa place.
 *
 * Il n'est pas sauvé tout de suite dans le transcript. Le composant agent
 * ouvre un nouvel `order` pour tout message `user`, et le modèle ne verrait pas
 * un message sauvé hors de l'`order` du run (R13, cf. harness/transcript.ts).
 * C'est la harness qui le place, au début de la génération suivante — après
 * le round de tools en cours — ou, si le run se termine avant, comme premier
 * message du run suivant.
 *
 * L'UI affiche les submissions `queued` de l'utilisateur comme des bulles
 * « en file ». Celles de l'app (`origin`, ex. le rapport d'un sous-agent
 * d'arrière-plan) ne s'affichent pas en file et survivent à un stop : un
 * rapport n'est jamais perdu, il attend le run suivant.
 */
const submissionStatuses = {
  queued: "queued",
  placed: "placed",
  withdrawn: "withdrawn",
} as const;

const submissionsValidator = v.object({
  threadId: v.string(),
  userId: v.id("users"),
  canvasId: v.id("canvases"),
  status: v.union(
    v.literal(submissionStatuses.queued),
    v.literal(submissionStatuses.placed),
    v.literal(submissionStatuses.withdrawn),
  ),
  // Ce que l'utilisateur a tapé : la bulle « en file », et le message sauvé
  // s'il ouvre un run.
  prompt: v.string(),
  // Ce que le modèle voit s'il est placé dans un run en cours : le texte et
  // son contexte (pièces jointes), calculés par le profil à l'envoi. L'UI
  // n'affiche que le contenu de `<user_message>`.
  content: v.string(),
  // Ce que reçoit la première génération s'il ouvre un run (cf. Profile).
  input: v.any(),
  model: v.optional(v.string()),
  // Pièces jointes, recopiées dans `messageMetadata` au placement.
  attachments: v.optional(
    v.object({
      nodes: v.optional(
        v.array(v.object({ id: v.string(), type: v.string(), title: v.string() })),
      ),
      position: v.optional(v.object({ x: v.number(), y: v.number() })),
    }),
  ),
  // Le message créé au placement.
  messageId: v.optional(v.string()),
  // Absent : envoyé par l'utilisateur. `subagent` : rapport d'un sous-agent
  // d'arrière-plan (cf. harness/subagents.ts).
  origin: v.optional(v.literal("subagent")),
});

export { submissionsValidator, submissionStatuses };
