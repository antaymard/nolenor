import type { Agent } from "@convex-dev/agent";
import type { ToolSet } from "ai";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx, MutationCtx } from "../_generated/server";
import type { ToolReplay } from "../schemas/agentTasksSchema";

/** Ce qu'une tâche sait du run qu'elle sert. */
export type RunInfo = {
  threadId: string;
  userId: Id<"users">;
  canvasId: Id<"canvases">;
  /** Le message qui a ouvert le run. */
  runMessageId: string;
  /** Choix explicite de l'utilisateur ; absent = défaut du profil. */
  model?: string;
};

/** Une section d'un `<system_update>` : `<tag>content</tag>`. */
export type ContextSection = { tag: string; content: string };

/** La fenêtre d'un step : ce qui a changé entre `since` et `until`. */
export type StepWindow = {
  step: number;
  /** Début de la génération précédente ; `null` au premier step. */
  since: number | null;
  until: number;
};

export type Memory = { id: string; content: string; score?: number };

/**
 * Une mémoire, vue par la harness : elle rend les souvenirs pertinents pour
 * un step. La harness ne réinjecte jamais un souvenir déjà vu dans le run, et
 * logue ce qu'elle injecte (`agentTasks.memories`).
 */
export interface MemoryProvider {
  recall(ctx: ActionCtx, run: RunInfo, window: StepWindow): Promise<Memory[]>;
}

/** Ce que le modèle voit pour un run, figé à son ouverture (cf. runPrompts). */
export type RunPrompts = {
  systemPrompt: string;
  llmPrompt: string;
};

/**
 * Un profil d'agent : tout ce que le kernel ne sait pas de Nolë.
 *
 * Le kernel n'appelle que ces méthodes. Elles sont pures vis-à-vis de l'état
 * du run : pour un même `RunInfo`, `tools()` doit rendre le même ensemble dans
 * la génération (qui ne fait que le décrire au modèle) et dans le tool (qui
 * l'exécute).
 */
export interface Profile {
  name: string;
  /** Nom porté par les messages du run et par `threadMetadata.agentName`. */
  agentName: string;
  /** Plafond de générations par run ; les tools de la dernière s'exécutent. */
  maxGenerationsPerRun: number;
  /**
   * Calcule les prompts du run, une fois, à l'ouverture. `input` est ce que
   * le point d'entrée a confié à la première génération.
   */
  prepareRun(ctx: ActionCtx, run: RunInfo, input: unknown): Promise<RunPrompts>;
  /** L'agent du composant : modèle et `usageHandler`. Sans tools. */
  agent(run: RunInfo): Agent;
  /** Les tools du run, avec leur `execute`. */
  tools(run: RunInfo): ToolSet;
  /** Un tool interrompu peut-il être relancé sans risque ? */
  replay(toolName: string): ToolReplay;
  /**
   * Ce qui a changé pendant la fenêtre du step (hors effets du run lui-même),
   * envoyé au modèle en `<system_update>`. Le system prompt et le message
   * d'ouverture restent figés : c'est ce qui garde le cache.
   */
  /**
   * Tools que le modèle ne voit qu'après les avoir chargés (`load_tools`).
   * `tools()` les rend quand même : c'est elle qui les exécute.
   */
  deferredTools?: readonly string[];
  stepContext?(
    ctx: ActionCtx,
    run: RunInfo,
    window: StepWindow,
  ): Promise<ContextSection[]>;
  memory?: MemoryProvider;
  compaction?: CompactionSettings;
  /** Le profil des sous-agents que ce profil peut lancer (`run_subAgent`). */
  subagents?: { profile: string };
  /** Peut poser une question à l'utilisateur et l'attendre (`ask_user`). */
  askUser?: boolean;
  /** Aiguille les demandes envoyées sans thread (cf. harness/dispatch.ts). */
  router?: Router;
  /**
   * Un thread vient d'être ouvert par l'aiguillage, son premier message
   * envoyé (ex. lui donner un titre, ce que fait le client après un envoi
   * direct).
   */
  threadCreated?(ctx: MutationCtx, threadId: string): Promise<void>;
}

/** Un thread vers lequel une demande pourrait partir. */
export type DispatchCandidate = {
  threadId: string;
  title: string | null;
  /** `running` : il travaille ; `waiting` : il attend une réponse. */
  status: "running" | "waiting" | "idle";
  /** Les questions en attente, quand `waiting`. */
  pendingQuestion?: string;
  /** Les dernières demandes de l'utilisateur, les plus récentes d'abord. */
  recentRequests: string[];
  /** Les nodes que le thread a créés ou modifiés. */
  touchedNodeIds: string[];
  /** Le résumé de compaction, s'il en a un (tronqué). */
  summary?: string;
  lastActivityAt: number;
};

/**
 * Choisit, pour une demande, le thread qui la traite, ou aucun (nouveau
 * thread). La harness n'interprète que `threadId` et `confidence` ; le choix
 * des signaux et du modèle (Jev, un LLM…) est celui de l'implémentation.
 */
export interface Router {
  route(
    ctx: ActionCtx,
    request: { prompt: string; nodeIds: string[]; userId: Id<"users"> },
    candidates: DispatchCandidate[],
  ): Promise<{ threadId: string | null; confidence?: number }>;
}

/**
 * Compaction (cf. harness/compaction.ts) : quand le contexte dépasse le seuil
 * en fin de run, ou déborde en plein run, sa partie ancienne est remplacée
 * par un résumé.
 */
export interface CompactionSettings {
  /** Fenêtre de contexte du modèle du run, en tokens. */
  contextWindow(run: RunInfo): number;
  /** Part de la fenêtre au-delà de laquelle on compacte en fin de run. */
  thresholdRatio: number;
  /** Le format du résumé, ajouté à la consigne du kernel. */
  instructions: string;
  /**
   * État que la harness calcule elle-même plutôt que de le confier au résumé
   * (ex. nodes lus, créés, modifiés). Ajouté tel quel au résumé.
   */
  trackedState?(ctx: ActionCtx, run: RunInfo): Promise<string>;
}
