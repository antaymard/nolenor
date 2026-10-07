import { v } from "convex/values";

/**
 * Ce que le modèle voit pour un run, figé à son ouverture.
 *
 * Une ligne par run, écrite une fois par la première génération, jamais
 * patchée. Toutes les générations du run la relisent : le prompt reste stable
 * d'un step à l'autre (le cache du fournisseur reste chaud), et le replay
 * retrouve plus tard le system prompt tel qu'il était.
 *
 * À part de `threadMetadata` et de `messageMetadata`, que des queries clientes
 * renvoient en entier : quelques Ko de prompt n'ont rien à faire dans le
 * navigateur.
 */
const runPromptsValidator = v.object({
  threadId: v.string(),
  // Le message qui a ouvert le run.
  messageId: v.string(),
  systemPrompt: v.string(),
  // Ce que le modèle voit à la place du texte brut du message d'ouverture :
  // contexte du canvas, pièces jointes, puis le message.
  llmPrompt: v.string(),
});

export { runPromptsValidator };
