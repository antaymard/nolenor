import type { DispatchCandidate, Router } from "../../harness/types";
import { aiUsageSources } from "../../schemas/aiUsageSourceSchema";
import { askJev } from "../jev";

/**
 * L'aiguillage des demandes de l'omnibar par Jev (TypeSafe), via l'API
 * Decisions d'OpenRouter : pas de texte généré, un choix typé parmi des
 * options connues, avec ses probabilités et sa confiance.
 *
 * Une seule question `choice` : chaque thread candidat est une option (clé
 * courte `T1`…`T20`, décrite en une ligne), plus `new`. L'état (`state`)
 * porte le détail : demandes récentes, question en attente, nodes touchés,
 * résumé. Un `T…` qui ne correspond à rien vaut `new`.
 *
 * Usage compté sous la source `router` (cf. ia/jev.ts).
 */

const NEW_THREAD = "new";

const INSTRUCTIONS =
  "The user just sent a new request (state.request) to an assistant that works for them on a visual canvas, in several parallel conversation threads (state.threads). Which thread should handle it? Choose a thread when the request continues, refines, corrects or follows up on what that thread is doing or did. A thread whose status is 'waiting' asked the user a question (pending_question): choose it only if the request answers that question. Choose 'new' when the request is a separate task, or too unrelated to any thread.";

const STATUS_LABEL: Record<DispatchCandidate["status"], string> = {
  running: "working now",
  waiting: "waiting for the user's answer",
  idle: "idle",
};

function optionLabel(candidate: DispatchCandidate): string {
  const subject =
    candidate.title ?? candidate.recentRequests[0] ?? "Untitled thread";
  return `${subject} (${STATUS_LABEL[candidate.status]})`;
}

export const jevRouter: Router = {
  async route(ctx, request, candidates) {
    const keys = candidates.map((_, index) => `T${index + 1}`);
    const answers = await askJev(ctx, {
      userId: request.userId,
      source: aiUsageSources.router,
      state: {
        request: request.prompt,
        mentioned_node_ids: request.nodeIds,
        threads: candidates.map((candidate, index) => ({
          id: keys[index],
          title: candidate.title,
          status: candidate.status,
          ...(candidate.pendingQuestion
            ? { pending_question: candidate.pendingQuestion }
            : {}),
          recent_requests: candidate.recentRequests,
          touched_node_ids: candidate.touchedNodeIds,
          ...(candidate.summary ? { summary: candidate.summary } : {}),
        })),
      },
      questions: {
        thread: {
          type: "choice",
          instructions: INSTRUCTIONS,
          criteria: {
            ...Object.fromEntries(
              candidates.map((candidate, index) => [
                keys[index],
                optionLabel(candidate),
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
