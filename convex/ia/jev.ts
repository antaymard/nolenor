import { internal } from "../_generated/api";
import type { ActionCtx } from "../_generated/server";
import type { AiUsageSource } from "../schemas/aiUsageSourceSchema";

/**
 * Jev (TypeSafe) via l'API Decisions d'OpenRouter : des décisions typées
 * (`choice`, `noul`, `score`) avec probabilités et confiance, sans texte
 * généré. Ce n'est pas du chat completions : appel HTTP direct, et usage
 * compté à la main.
 */

const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";
export const JEV_MODEL = "typesafe/jev-1.13";
const TIMEOUT_MS = 8000;

export type JevQuestion =
  | {
      type: "choice";
      instructions: string;
      criteria: Record<string, string>;
    }
  | {
      type: "noul";
      instructions: string;
      criteria?: { true: string; false: string };
    };

export type JevAnswer = {
  type?: string;
  choice?: string;
  confidence?: number;
  probabilities?: Record<string, number>;
  noul?: number;
};

type DecisionsResponse = {
  model?: string;
  answers?: Record<string, JevAnswer | undefined>;
  usage?: { cost?: number; input_tokens?: number; output_tokens?: number };
};

/** Pose des questions à Jev ; lève sur toute réponse HTTP non 2xx. */
export async function askJev(
  ctx: Pick<ActionCtx, "runMutation">,
  args: {
    userId: string;
    source: AiUsageSource;
    state: unknown;
    questions: Record<string, JevQuestion>;
  },
): Promise<Record<string, JevAnswer | undefined>> {
  const response = await fetch(DECISIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: JEV_MODEL,
      user: args.userId,
      state: args.state,
      questions: args.questions,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `Jev ${response.status}: ${(await response.text()).slice(0, 300)}`,
    );
  }
  const data = (await response.json()) as DecisionsResponse;
  await recordUsage(ctx, args.userId, args.source, data);
  return data.answers ?? {};
}

/** Ne fait jamais échouer l'appelant : la comptabilité se logue, c'est tout. */
async function recordUsage(
  ctx: Pick<ActionCtx, "runMutation">,
  userId: string,
  source: AiUsageSource,
  data: DecisionsResponse,
) {
  try {
    const inputTokens = data.usage?.input_tokens ?? 0;
    const outputTokens = data.usage?.output_tokens ?? 0;
    await ctx.runMutation(internal.wrappers.aiUsageWrappers.recordUsage, {
      source,
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
    console.error("[jev] failed to record usage", {
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

