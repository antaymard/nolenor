import { v, type Infer } from "convex/values";

/**
 * Une tâche de la harness : l'unité d'exécution durable d'un run d'agent.
 *
 * Un run est une chaîne de tâches `generation` (un appel modèle chacune, une
 * action chacune). Une génération qui rend des tool calls crée une tâche
 * `tool` par appel, les possède (`ownerTaskId`) et attend : aucune action ne
 * tourne pendant ce temps. Quand la dernière se termine, la mutation qui la
 * clôt crée la génération suivante.
 *
 * Toutes les transitions passent par `harness/tasks.ts`. Le détail (une ligne
 * par appel modèle et par tool call) vit ici et non sur `threadMetadata`, que
 * l'UI lit en continu et qui est déjà patché à chaque step.
 */

const agentTaskKinds = {
  generation: "generation",
  tool: "tool",
  // Résumé de la partie ancienne du thread (cf. harness/compaction.ts). En fin
  // de run, sans propriétaire ; sur débordement, possédée par la génération
  // qu'elle débloque.
  compaction: "compaction",
} as const;

const agentTaskStatuses = {
  pending: "pending",
  running: "running",
  // Une génération qui attend ses tools ; un tool qui attend une réponse
  // venue d'ailleurs (fin d'un sous-agent, réponse de l'utilisateur) — sans
  // lease ni action en cours (cf. harness/kernelTools.ts).
  waiting: "waiting",
  completed: "completed",
  failed: "failed",
  // Lease expiré pendant un tool `unsafe` : le modèle reçoit un résultat
  // « interrompu » au lieu d'une seconde exécution.
  interrupted: "interrupted",
  aborted: "aborted",
} as const;

const vAgentTaskStatus = v.union(
  v.literal(agentTaskStatuses.pending),
  v.literal(agentTaskStatuses.running),
  v.literal(agentTaskStatuses.waiting),
  v.literal(agentTaskStatuses.completed),
  v.literal(agentTaskStatuses.failed),
  v.literal(agentTaskStatuses.interrupted),
  v.literal(agentTaskStatuses.aborted),
);

const vToolReplay = v.union(v.literal("safe"), v.literal("unsafe"));

const agentTaskValidator = v.object({
  kind: v.union(
    v.literal(agentTaskKinds.generation),
    v.literal(agentTaskKinds.tool),
    v.literal(agentTaskKinds.compaction),
  ),
  // Profil d'agent qui exécute la tâche (cf. harness/profiles.ts).
  profile: v.string(),
  threadId: v.string(),
  canvasId: v.id("canvases"),
  userId: v.id("users"),
  // Le message qui a ouvert le run : identifiant du run, clé de `runPrompts`.
  runMessageId: v.string(),
  // Absent pour une génération (possédée par son thread) ; la génération
  // propriétaire pour un tool, ou pour une compaction sur débordement.
  ownerTaskId: v.optional(v.id("agentTasks")),

  status: vAgentTaskStatus,
  // Incrémenté à chaque claim. Toute écriture de fin porte l'attempt qu'elle a
  // reçu : celle d'une exécution périmée est refusée (fencing).
  attempt: v.number(),
  // Au-delà, la tâche est tenue pour perdue et le cron la reprend. Posé dès la
  // création : une action planifiée qui ne démarre jamais est rattrapée aussi.
  leaseExpiresAt: v.optional(v.number()),
  // Premier démarrage d'action. Pour un tool, c'est aussi l'intention
  // enregistrée : un tool déjà démarré qu'on retrouve `pending` a peut-être
  // produit ses effets.
  startedAt: v.optional(v.number()),
  endedAt: v.optional(v.number()),
  error: v.optional(v.string()),

  // ── generation ──
  // Rang de la génération dans le run, à partir de 1.
  step: v.optional(v.number()),
  // Position de sauvegarde de la réponse (cf. transcript.ts).
  promptMessageId: v.optional(v.string()),
  // Choix explicite de l'utilisateur ; absent = modèle par défaut du profil.
  model: v.optional(v.string()),
  usage: v.optional(v.record(v.string(), v.any())),
  finishReason: v.optional(v.string()),
  responseMessageId: v.optional(v.string()),
  responseOrder: v.optional(v.number()),
  responseModel: v.optional(v.string()),
  responseProvider: v.optional(v.string()),
  // Nom d'agent porté par les messages du run (affichage, attribution).
  agentName: v.optional(v.string()),
  // Ce qui a changé depuis le step précédent, tel que le modèle l'a reçu
  // (`<system_update>…`). Absent si rien n'a changé. Placé dans le contexte
  // juste avant la réponse de cette génération, et seulement pendant son run
  // (cf. transcript.ts) : au run suivant, il n'existe plus pour le modèle.
  systemUpdate: v.optional(v.string()),
  // Souvenirs injectés par ce step : jamais deux fois dans un run, et la base
  // de l'évaluation de la mémoire.
  memories: v.optional(
    v.array(v.object({ id: v.string(), score: v.optional(v.number()) })),
  ),

  // ── generation (step 1) et tool : entrée ──
  input: v.optional(v.any()),

  // ── tool ──
  toolCallId: v.optional(v.string()),
  toolName: v.optional(v.string()),
  explanation: v.optional(v.string()),
  replay: v.optional(vToolReplay),
  resultMessageId: v.optional(v.string()),
  // Tool résolu ailleurs (cf. harness/kernelTools.ts) : le thread du
  // sous-agent qu'il a lancé.
  childThreadId: v.optional(v.string()),
});

type AgentTaskStatus = Infer<typeof vAgentTaskStatus>;
type ToolReplay = Infer<typeof vToolReplay>;

const terminalAgentTaskStatuses: readonly AgentTaskStatus[] = [
  agentTaskStatuses.completed,
  agentTaskStatuses.failed,
  agentTaskStatuses.interrupted,
  agentTaskStatuses.aborted,
];

const liveAgentTaskStatuses: readonly AgentTaskStatus[] = [
  agentTaskStatuses.pending,
  agentTaskStatuses.running,
  agentTaskStatuses.waiting,
];

function isTerminalAgentTaskStatus(status: AgentTaskStatus): boolean {
  return terminalAgentTaskStatuses.includes(status);
}

export {
  agentTaskValidator,
  agentTaskKinds,
  agentTaskStatuses,
  vAgentTaskStatus,
  vToolReplay,
  liveAgentTaskStatuses,
  isTerminalAgentTaskStatus,
  type AgentTaskStatus,
  type ToolReplay,
};
