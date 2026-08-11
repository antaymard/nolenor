import { v } from "convex/values";

/**
 * Valeurs de `threadMetadata.agentName`. Ce champ discrimine les threads
 * racine (la conversation Nolë affichée dans le panel) des threads de
 * sous-agents, qui auront eux aussi une ligne de metadata pour le suivi des
 * coûts. La distinction est portée par la clé d'index
 * `by_userId_and_canvasId_and_agentName` : un filtre appliqué après le scan
 * ne réduirait pas les lignes lues, et un thread racine peut engendrer
 * beaucoup de threads de sous-agents.
 */
const threadAgentNames = {
  nole: "Nolë",
  worker: "Worker",
} as const;

const threadMetadataValidator = v.object({
  threadId: v.string(),
  userId: v.id("users"),
  canvasId: v.id("canvases"),
  // Absent sur un thread racine ; sur un thread de sous-agent, le threadId de
  // la conversation Nolë qui l'a déclenché (même vocabulaire que
  // taskExecutions.masterThreadId). Permet d'agréger les coûts d'un thread et
  // de sa descendance.
  masterThreadId: v.optional(v.string()),
  totalUsageUsd: v.number(),
  touchedNodeDataIds: v.optional(v.array(v.id("nodeDatas"))), // Nodedata that have been modified during the thread, by the agent
  agentName: v.string(),
  lastMessageTime: v.optional(v.number()),
  // Nombre de messages envoyés par l'utilisateur sur ce thread, incrémenté par
  // `threadMetadataWrappers.touch`. À ne pas confondre avec le nombre de steps
  // LLM, qui vit dans `aiUsageDaily.eventsCount`.
  roundsNb: v.optional(v.number()),
});

export { threadMetadataValidator, threadAgentNames };
