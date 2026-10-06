import type { Agent } from "@convex-dev/agent";
import type { ToolSet } from "ai";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
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
}
