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
 * État d'un run (`runs.status`), et de la pastille d'un thread : celui de son
 * run en cours, ou l'issue du dernier (cf. `runModels.threadRunState`).
 *
 * Le détail (token courant, tool en cours, reasoning) reste au flux client,
 * qui le donne gratuitement. Pas d'état « périmé » : la harness conclut
 * toujours un run, au besoin via le cron de reprise.
 */
const threadRunStatuses = {
  running: "running",
  // Le run attend une réponse de l'utilisateur (`ask_user`) : ni en cours, ni
  // fini, et jamais périmé — une question peut attendre des heures.
  waiting: "waiting",
  idle: "idle",
  error: "error",
  aborted: "aborted",
} as const;

const threadRunStatusValidator = v.union(
  v.literal(threadRunStatuses.running),
  v.literal(threadRunStatuses.waiting),
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
 * La dernière action de l'agent sur un run, telle qu'il l'a formulée
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

/**
 * Le run d'agent en cours sur un thread (cf. convex/harness).
 *
 * - `startMessageId` : le message qui l'a ouvert, son identifiant ;
 * - `promptMessageId` : la position où les réponses sont sauvées. Égal au
 *   précédent tant qu'aucun steer n'a été placé ;
 * - `generationTaskId` : la génération courante, la seule autorisée à
 *   enchaîner ;
 * - `maxGenerations` : plafond du profil, recopié pour que les mutations n'aient
 *   pas à charger le profil ;
 * - `profile` : le profil du run, pour ouvrir le suivant à partir des messages
 *   arrivés pendant celui-ci.
 */
const threadRunValidator = v.object({
  profile: v.string(),
  startMessageId: v.string(),
  promptMessageId: v.string(),
  generationTaskId: v.id("agentTasks"),
  // Déprécié : l'ancien jeton de fin de run. Plus écrit ni lu ; reste optionnel
  // le temps que les runs ouverts avant sa suppression se terminent.
  runToken: v.optional(v.number()),
  maxGenerations: v.number(),
  // Le modèle des générations à venir. Lu à chaque claim : un changement de
  // modèle pendant le run (sélecteur, steer) prend effet au step suivant.
  model: v.optional(v.string()),
  // Tools différés chargés par le modèle (`load_tools`) : décrits à toutes
  // les générations suivantes du run.
  loadedTools: v.optional(v.array(v.string())),
  // La question (`ask_user`) qui attend la réponse de l'utilisateur : son
  // prochain message y répond au lieu de partir en file.
  awaitingTaskId: v.optional(v.id("agentTasks")),
  // Run d'un sous-agent : le tool call du parent qui l'a lancé. À la fin du
  // run, son résultat y est écrit (premier plan) ou renvoyé au thread parent
  // en followUp (arrière-plan).
  parent: v.optional(
    v.object({
      taskId: v.id("agentTasks"),
      threadId: v.string(),
      profile: v.string(),
      background: v.boolean(),
      model: v.optional(v.string()),
    }),
  ),
});

const threadMetadataValidator = v.object({
  threadId: v.string(),
  userId: v.id("users"),
  canvasId: v.id("canvases"),
  // Absent sur un thread racine ; sur un thread de sous-agent, le threadId de
  // la conversation Nolë qui l'a déclenché. Permet d'agréger les coûts d'un
  // thread et de sa descendance.
  masterThreadId: v.optional(v.string()),
  totalUsageUsd: v.number(),
  // Nodes touchés par l'agent au cours du thread, dans l'ordre de première
  // rencontre. Écrit par les wrappers de nodeDatas, à chaque write portant un
  // actor `agent` — et non depuis `maybeCheckpoint`, dont le coalescing
  // laisserait des trous.
  touchedNodes: v.optional(v.array(threadNodeTouchValidator)),
  agentName: v.string(),
  lastMessageTime: v.optional(v.number()),
  // Nombre de runs ouverts sur ce thread, incrémenté par
  // `threadMetadataModels.recordRunStart`. À ne pas confondre avec le nombre
  // de steps LLM, qui vit dans `aiUsageDaily.eventsCount`.
  roundsNb: v.optional(v.number()),
  // Dépréciés : l'état des runs vit dans la table `runs` (une ligne par
  // tâche) et dans `run` ci-dessous (le run en cours). Plus écrits ni lus ;
  // effacés par `migrations.clearThreadRunState`, puis à retirer d'ici.
  lastActivity: v.optional(threadLastActivityValidator),
  runStatus: v.optional(threadRunStatusValidator),
  runStartedAt: v.optional(v.number()),
  runEndedAt: v.optional(v.number()),
  lastRunError: v.optional(v.string()),
  reviewedAt: v.optional(v.number()),
  // Le run en cours de la harness, présent exactement tant qu'il travaille.
  // C'est la référence que toutes les tâches confrontent avant d'écrire : un
  // run abandonné (abort, nouveau message) ne fait plus rien dès qu'il n'est
  // plus celui-ci.
  run: v.optional(threadRunValidator),
});

type ThreadRunStatus = Infer<typeof threadRunStatusValidator>;

type ThreadNodeTouch = Infer<typeof threadNodeTouchValidator>;
type ThreadNodeTouchKind = Infer<typeof threadNodeTouchKindValidator>;

/** États terminaux : ce qu'un tour peut valoir une fois `running` quitté. */
type ThreadRunEndStatus = Exclude<ThreadRunStatus, "running" | "waiting">;

/** `runs.error` est affiché tel quel : on ne stocke pas une stack entière. */
const RUN_ERROR_MAX_LENGTH = 300;

/**
 * Borne de `runs.lastActivity.text`. Le tool demande au modèle une étiquette courte,
 * mais rien ne l'y oblige : la borne existe pour que la pastille reste une
 * pastille même le jour où il rédige un paragraphe.
 */
const ACTIVITY_TEXT_MAX_LENGTH = 140;

export {
  threadMetadataValidator,
  threadAgentNames,
  threadRunStatuses,
  threadRunStatusValidator,
  threadNodeTouchKinds,
  threadNodeTouchValidator,
  threadLastActivityValidator,
  threadRunValidator,
  ACTIVITY_TEXT_MAX_LENGTH,
  RUN_ERROR_MAX_LENGTH,
  type ThreadRunStatus,
  type ThreadRunEndStatus,
  type ThreadNodeTouch,
  type ThreadNodeTouchKind,
};
