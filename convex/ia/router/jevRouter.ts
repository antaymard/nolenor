import type { DispatchCandidate, Router } from "../../harness/types";
import { aiUsageSources } from "../../schemas/aiUsageSourceSchema";
import { askJev } from "../jev";

/**
 * L'aiguillage des demandes de l'omnibar par Jev (TypeSafe), via l'API
 * Decisions d'OpenRouter : pas de texte généré, un choix typé parmi des
 * options connues, avec ses probabilités et sa confiance.
 *
 * Une seule question `choice` : chaque thread candidat est une option (clé
 * courte `T1`…`T8`, décrite en une ligne), plus `new`. L'état (`state`)
 * porte le détail : âge, dernier run et son issue, demandes récentes,
 * dernière réponse, question en attente, nodes (titre et type, pas seulement
 * l'id), résumé. Un `T…` qui ne correspond à rien vaut `new`.
 *
 * Usage compté sous la source `router` (cf. ia/jev.ts).
 */

const NEW_THREAD = "new";

const INSTRUCTIONS = [
  "The user just sent a new request (state.request) to an assistant that works for them on a visual canvas, across several parallel conversation threads (state.threads). Which thread should handle it?",
  "- Choose a thread when the request continues, refines, corrects or follows up on what that thread is doing or just did: it reacts to its last_answer, or it is about the same nodes (compare state.request.attached_nodes with the thread's nodes, by id and title).",
  "- A thread whose status is 'waiting' asked the user a question (pending_question): choose it only if the request answers that question.",
  "- A short or vague request that points back to something without naming it ('and this one', 'make it shorter', 'redo it', 'same for…', a pronoun with no clear referent) follows up on the most recently active thread (smallest last_active): choose it if it was active in the last few minutes, otherwise choose 'new'.",
  "- Choose 'new' when the request is a separate task, or unrelated to every thread.",
].join("\n");

const STATUS_LABEL: Record<DispatchCandidate["status"], string> = {
  running: "working now",
  waiting: "waiting for the user's answer",
  idle: "idle",
};

/** `3 min ago`, `2 h ago` : une durée que Jev lit sans calcul. */
export function ago(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  return `${Math.round(seconds / 60)} min`;
}

function optionLabel(candidate: DispatchCandidate, now: number): string {
  const subject =
    candidate.title ?? candidate.recentRequests[0] ?? "Untitled thread";
  return `${subject} (${STATUS_LABEL[candidate.status]}, active ${ago(now - candidate.lastActivityAt)})`;
}

const LAST_RUN_LABEL: Record<
  NonNullable<DispatchCandidate["lastRun"]>["outcome"],
  string
> = {
  running: "in progress",
  waiting: "waiting for the user's answer",
  answered: "answered in the chat",
  edited_canvas: "edited the canvas",
  failed: "failed",
  stopped: "stopped by the user",
};

function describeThread(
  candidate: DispatchCandidate,
  key: string,
  now: number,
) {
  const lastRun = candidate.lastRun;
  return {
    id: key,
    title: candidate.title,
    status: candidate.status,
    last_active: ago(now - candidate.lastActivityAt),
    ...(lastRun
      ? {
          last_run:
            lastRun.endedAt === undefined
              ? `${LAST_RUN_LABEL[lastRun.outcome]}, started ${ago(now - lastRun.startedAt)}, running for ${duration(now - lastRun.startedAt)}`
              : `${LAST_RUN_LABEL[lastRun.outcome]}, ended ${ago(now - lastRun.endedAt)}`,
        }
      : {}),
    ...(candidate.pendingQuestion
      ? { pending_question: candidate.pendingQuestion }
      : {}),
    recent_requests: candidate.recentRequests,
    ...(candidate.lastAnswer ? { last_answer: candidate.lastAnswer } : {}),
    nodes: candidate.nodes.map((node) => ({
      id: node.id,
      title: node.title,
      type: node.type,
      access: node.access,
    })),
    ...(candidate.summary ? { summary: candidate.summary } : {}),
  };
}

export const jevRouter: Router = {
  async route(ctx, request, candidates) {
    const keys = candidates.map((_, index) => `T${index + 1}`);
    const now = Date.now();
    const answers = await askJev(ctx, {
      userId: request.userId,
      source: aiUsageSources.router,
      state: {
        request: {
          text: request.prompt,
          attached_nodes: request.nodes,
        },
        threads: candidates.map((candidate, index) =>
          describeThread(candidate, keys[index], now),
        ),
      },
      questions: {
        thread: {
          type: "choice",
          instructions: INSTRUCTIONS,
          criteria: {
            ...Object.fromEntries(
              candidates.map((candidate, index) => [
                keys[index],
                optionLabel(candidate, now),
              ]),
            ),
            [NEW_THREAD]:
              "A new thread: the request is a separate task from all the threads above.",
          },
        },
      },
    });

    const answer = answers.thread;
    const index = answer?.choice ? keys.indexOf(answer.choice) : -1;
    return {
      threadId: index >= 0 ? candidates[index].threadId : null,
      ...(typeof answer?.confidence === "number"
        ? { confidence: answer.confidence }
        : {}),
    };
  },
};
