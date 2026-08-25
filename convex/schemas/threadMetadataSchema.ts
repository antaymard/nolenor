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

/**
 * Ce qu'un thread a fait à un node. Un verbe par chemin d'écriture déjà
 * distinct côté wrappers : `moved` (la position vit sur `canvasNodes`, autre
 * wrapper) et `executed` (les runs d'app node) entreront comme un littéral de
 * plus le jour où on les voudra, sans nouveau champ de schéma.
 */
const threadNodeTouchKinds = {
  created: "created",
  updated: "updated",
  deleted: "deleted",
} as const;

const threadNodeTouchKindValidator = v.union(
  v.literal(threadNodeTouchKinds.created),
  v.literal(threadNodeTouchKinds.updated),
  v.literal(threadNodeTouchKinds.deleted),
);

/**
 * Un node touché par l'agent, et à quel titre.
 *
 * `at` est le *premier* contact, pas le dernier : la ligne `threadMetadata` est
 * déjà patchée une fois par step LLM par `addUsage`, et réécrire `at` à chaque
 * édition d'un même node y ajouterait de la contention pour rien. Ordonner les
 * nodes distincts entre eux est le seul usage réel.
 */
const threadNodeTouchValidator = v.object({
  nodeDataId: v.id("nodeDatas"),
  kind: threadNodeTouchKindValidator,
  at: v.number(),
});

/**
 * La dernière action de l'agent sur ce thread, telle qu'il l'a formulée
 * lui-même : le champ `explanation` que porte l'entrée de chaque tool.
 *
 * C'est du détail fin, et le détail fin vit d'ordinaire dans le flux de
 * messages, qui le donne gratuitement. Celui-ci fait exception parce qu'il est
 * précisément ce qu'on veut lire quand la conversation n'est PAS à l'écran —
 * au dock, sur le canvas. Le flux ne renseigne que le thread dont un composant
 * est monté ; sans cette copie, une tâche qui travaille en arrière-plan n'a
 * rien à dire d'elle-même.
 *
 * Une seule ligne conservée, la dernière : c'est un état, pas un journal.
 * L'historique complet reste dans les messages.
 */
const threadLastActivityValidator = v.object({
  text: v.string(),
  at: v.number(),
});

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
  // Nodes touchés par l'agent au cours du thread, dans l'ordre de première
  // rencontre. Écrit par les wrappers de nodeDatas, à chaque write portant un
  // actor `agent` — et non depuis `maybeCheckpoint`, dont le coalescing
  // laisserait des trous.
  touchedNodes: v.optional(v.array(threadNodeTouchValidator)),
  // Dernière action de l'agent, écrite à chaque tool call par l'enveloppe de
  // `getToolsForAgent`. Effacée par `markRunStarted` : un thread relancé ne doit
  // pas afficher une seconde la dernière action du tour précédent. Survit en
  // revanche à `markRunEnded` — c'est le meilleur résumé de ce qui vient d'être
  // fait, et le dock le montre jusqu'à la revue.
  lastActivity: v.optional(threadLastActivityValidator),
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
  // Accusé de réception humain du dernier tour conclu. Orthogonal à
  // `runStatus`, et non une valeur de plus dedans : on peut avoir vu un échec,
  // et fondre les deux ferait disparaître la pastille rouge de la liste de
  // threads au moment même où on accuse réception. C'est ce champ qui sort une
  // tâche du dock d'activité ; `markRunStarted` l'efface pour qu'un thread
  // relancé y revienne.
  reviewedAt: v.optional(v.number()),
});

type ThreadRunStatus = Infer<typeof threadRunStatusValidator>;

type ThreadNodeTouch = Infer<typeof threadNodeTouchValidator>;
type ThreadNodeTouchKind = Infer<typeof threadNodeTouchKindValidator>;

/** États terminaux : ce qu'un tour peut valoir une fois `running` quitté. */
type ThreadRunEndStatus = Exclude<ThreadRunStatus, "running">;

/** `lastRunError` est affiché tel quel : on ne stocke pas une stack entière. */
const RUN_ERROR_MAX_LENGTH = 300;

/**
 * Borne de `lastActivity.text`. Le tool demande au modèle une étiquette courte,
 * mais rien ne l'y oblige : la borne existe pour que la pastille reste une
 * pastille même le jour où il rédige un paragraphe.
 */
const ACTIVITY_TEXT_MAX_LENGTH = 140;

/**
 * Au-delà de ce délai, un thread encore marqué `running` est tenu pour
 * interrompu. Le serveur écrit son état terminal dans un `finally`, mais rien
 * ne s'exécute quand l'action meurt avec son conteneur : sans cette borne, la
 * pastille tournerait indéfiniment — pire que pas de statut, l'utilisateur y
 * croit.
 *
 * Généreux à dessein : un tour Nolë va jusqu'à 25 steps, dont des sous-agents.
 *
 * Vit ici, et non côté client, parce que les deux bords en ont besoin : l'UI
 * pour afficher `stale`, et `threadMetadataModels.markReviewed` pour accepter
 * de clore un tour périmé. Deux constantes qui divergent, et une pastille
 * devient indélogeable.
 */
const RUN_STALE_MS = 15 * 60 * 1000;

export {
  threadMetadataValidator,
  threadAgentNames,
  threadRunStatuses,
  threadRunStatusValidator,
  threadNodeTouchKinds,
  threadNodeTouchValidator,
  threadLastActivityValidator,
  ACTIVITY_TEXT_MAX_LENGTH,
  RUN_ERROR_MAX_LENGTH,
  RUN_STALE_MS,
  type ThreadRunStatus,
  type ThreadRunEndStatus,
  type ThreadNodeTouch,
  type ThreadNodeTouchKind,
};
