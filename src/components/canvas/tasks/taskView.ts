import type { ThreadNodeTouch } from "@/../convex/schemas/threadMetadataSchema";
import {
  resolveRunStatus,
  type PendingTask,
  type ResolvedRunStatus,
} from "@/lib/threadRunStatus";
import {
  readAskedQuestions,
  type AskedQuestion,
} from "@/components/canvas/nole-panel/message/activity/activityModel";

/**
 * Ce qu'une carte de tâche montre, déduit de son statut et des signaux de son
 * issue (cf. convex/runs.ts `outcome`). Toutes les règles d'affichage sont
 * ici, sans React : les briques (`parts/`) ne font que rendre la vue.
 *
 * Une carte, trois zones :
 * - l'en-tête : la demande, toujours ;
 * - le corps : UNE chose, la plus pressante — question > échec > réponse ;
 *   pendant le run, l'action en cours ;
 * - le pied : les nodes touchés et le travail en fond, avec n'importe quel
 *   corps (un échec partiel montre l'erreur ET ce qui a été fait).
 */

export type TaskBody =
  | { kind: "activity"; text: string }
  | { kind: "question"; questions: AskedQuestion[] }
  | { kind: "error"; message: string; partial: boolean; retryable: boolean }
  | { kind: "answer"; text: string };

/**
 * - `compact` : une ligne ou deux, l'intérêt est sur le canvas ;
 * - `expanded` : il y a quelque chose à lire ;
 * - `attention` : il y a quelque chose à faire.
 */
export type TaskEmphasis = "compact" | "expanded" | "attention";

export type TaskView = {
  status: ResolvedRunStatus;
  emphasis: TaskEmphasis;
  body: TaskBody | null;
  nodes: readonly ThreadNodeTouch[];
  /** Sous-agents d'arrière-plan lancés par la tâche, pas encore revenus. */
  pending: number;
  /** La croix pour écarter la tâche. Jamais pendant qu'elle tourne ou attend. */
  dismissible: boolean;
  /** Rien à montrer : la carte s'écarte d'elle-même après ce délai. */
  autoDismissMs: number | null;
};

/** Une tâche finie sans réponse utile ni trace sur le canvas. */
export const EMPTY_TASK_DISMISS_MS = 6000;

const STOPPED_MESSAGE = "Stopped before finishing.";
const FAILED_MESSAGE = "Something went wrong.";

export function resolveTaskView(task: PendingTask): TaskView {
  const status = resolveRunStatus(task);
  const { outcome } = task;
  const nodes = task.touchedNodes;
  const base = { status, nodes, pending: outcome.pending };

  if (status === "running") {
    return {
      ...base,
      emphasis: "compact",
      body: task.lastActivity
        ? { kind: "activity", text: task.lastActivity.text }
        : null,
      dismissible: false,
      autoDismissMs: null,
    };
  }

  if (status === "waiting") {
    const questions = task.pendingQuestions
      ? readAskedQuestions(task.pendingQuestions)
      : [];
    return {
      ...base,
      emphasis: "attention",
      body: questions.length > 0 ? { kind: "question", questions } : null,
      dismissible: false,
      autoDismissMs: null,
    };
  }

  if (status === "error" || status === "aborted") {
    return {
      ...base,
      // Arrêtée par l'utilisateur : rien d'inattendu, pas de quoi alerter.
      emphasis: status === "aborted" ? "compact" : "attention",
      body: {
        kind: "error",
        message:
          task.lastRunError ??
          (status === "aborted" ? STOPPED_MESSAGE : FAILED_MESSAGE),
        partial: outcome.canvas,
        retryable: true,
      },
      dismissible: true,
      autoDismissMs: null,
    };
  }

  // Fini.
  if (outcome.answer === true && outcome.answerText) {
    return {
      ...base,
      emphasis: "expanded",
      body: { kind: "answer", text: outcome.answerText },
      dismissible: true,
      autoDismissMs: null,
    };
  }
  const nothingToShow =
    outcome.answer === false && !outcome.canvas && outcome.pending === 0;
  return {
    ...base,
    emphasis: "compact",
    body: null,
    dismissible: true,
    autoDismissMs: nothingToShow ? EMPTY_TASK_DISMISS_MS : null,
  };
}
