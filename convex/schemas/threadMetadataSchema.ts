import { v, type Infer } from "convex/values";

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

/**
 * État grossier du tour en cours, écrit par le serveur. C'est la seule façon
 * de savoir qu'un thread travaille sans avoir sa conversation à l'écran : le
 * flux de messages ne renseigne que le thread dont un composant est monté.
 *
 * Le détail (token courant, tool en cours, reasoning) reste au flux client,
 * qui le donne gratuitement ; le dupliquer ici demanderait une écriture par
 * step LLM.
 *
 * Pas de littéral « périmé » : un `running` que plus personne ne terminera se
 * reconnaît à son âge, et l'âge se lit côté client (cf. `resolveRunStatus`).
 * Une query qui lirait l'horloge ne se réévaluerait jamais.
 */
const threadRunStatuses = {
  running: "running",
  idle: "idle",
  error: "error",
  aborted: "aborted",
} as const;

const threadRunStatusValidator = v.union(
  v.literal(threadRunStatuses.running),
  v.literal(threadRunStatuses.idle),
  v.literal(threadRunStatuses.error),
  v.literal(threadRunStatuses.aborted),
);

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
  // Nodes modifiés par l'agent au cours du thread. Écrit par les wrappers de
  // nodeDatas, à chaque write portant un actor `agent` — et non depuis
  // `maybeCheckpoint`, dont le coalescing laisserait des trous.
  touchedNodeDataIds: v.optional(v.array(v.id("nodeDatas"))),
  agentName: v.string(),
  lastMessageTime: v.optional(v.number()),
  // Nombre de messages envoyés par l'utilisateur sur ce thread, incrémenté par
  // `threadMetadataWrappers.markRunStarted`. À ne pas confondre avec le nombre
  // de steps LLM, qui vit dans `aiUsageDaily.eventsCount`.
  roundsNb: v.optional(v.number()),
  // Absent = jamais lancé, donc `idle` : aucune migration à faire.
  runStatus: v.optional(threadRunStatusValidator),
  runStartedAt: v.optional(v.number()),
  runEndedAt: v.optional(v.number()),
  // Message d'erreur du dernier tour échoué, tronqué : il est affiché tel quel.
  lastRunError: v.optional(v.string()),
});

type ThreadRunStatus = Infer<typeof threadRunStatusValidator>;

/** États terminaux : ce qu'un tour peut valoir une fois `running` quitté. */
type ThreadRunEndStatus = Exclude<ThreadRunStatus, "running">;

/** `lastRunError` est affiché tel quel : on ne stocke pas une stack entière. */
const RUN_ERROR_MAX_LENGTH = 300;

export {
  threadMetadataValidator,
  threadAgentNames,
  threadRunStatuses,
  threadRunStatusValidator,
  RUN_ERROR_MAX_LENGTH,
  type ThreadRunStatus,
  type ThreadRunEndStatus,
};
