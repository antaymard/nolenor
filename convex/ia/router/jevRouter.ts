import { internal } from "../../_generated/api";
import type { DispatchCandidate, Router } from "../../harness/types";
import { aiUsageSources } from "../../schemas/aiUsageSourceSchema";

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
 * Ce n'est pas du chat completions : appel HTTP direct, et usage compté à la
 * main (source `router`).
 */

const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
export const JEV_MODEL = "typesafe/jev-1.13";
const TIMEOUT_MS = 8000;
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

type DecisionsResponse = {
  model?: string;
  answers?: Record<
    string,
    { type?: string; choice?: string; confidence?: number } | undefined
  >;
  usage?: { cost?: number; input_tokens?: number; output_tokens?: number };
};

export const jevRouter: Router = {
  async route(ctx, request, candidates) {
    const keys = candidates.map((_, index) => `T${index + 1}`);
    const body = {
      model: JEV_MODEL,
      user: request.userId,
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
    };

    const response = await fetch(DECISIONS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `Jev ${response.status}: ${(await response.text()).slice(0, 300)}`,
      );
    }
    const data = (await response.json()) as DecisionsResponse;
    await recordUsage(ctx, request.userId, data);

    const answer = data.answers?.thread;
    const index = answer?.choice ? keys.indexOf(answer.choice) : -1;
    return {
      threadId: index >= 0 ? candidates[index].threadId : null,
      ...(typeof answer?.confidence === "number"
        ? { confidence: answer.confidence }
        : {}),
    };
  },
};

/** Ne fait jamais échouer l'aiguillage : la comptabilité se logue, c'est tout. */
async function recordUsage(
  ctx: Parameters<Router["route"]>[0],
  userId: string,
  data: DecisionsResponse,
) {
  try {
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    await ctx.runMutation(internal.wrappers.aiUsageWrappers.recordUsage, {
      source: aiUsageSources.router,
      userId,
      model: data.model ?? JEV_MODEL,
      provider: "openrouter",
      ...(typeof data.usage?.cost === "number" ? { costUsd: data.usage.cost } : {}),
      tokens: {
        inputTokens,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens,
        reasoningTokens: 0,
        totalTokens: inputTokens + outputTokens,
      },
    });
  } catch (error) {
    console.error("[router] failed to record usage", {
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
