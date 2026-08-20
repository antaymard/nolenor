import { ConvexError } from "convex/values";
import { AISDKError, APICallError } from "@ai-sdk/provider";

/**
 * Failure categories for the sub-agent launcher.
 *
 * Splitting failures into kinds lets us do two things the old single-string
 * error could not: log the *real* cause on the backend, and hand the parent
 * model a message it can actually act on — distinguishing "you passed bad
 * arguments" (fix them) from "the worker crashed" or "the backend is down"
 * (retry, not your fault).
 *
 * The three middle kinds exist because the first version of this taxonomy
 * collapsed every non-`ConvexError` into `infrastructure`, which made the
 * bucket useless: a worker that quietly ran out of steps, one whose provider
 * returned 429, and one killed by the action time limit all looked identical
 * and all carried Convex's redacted "Server Error" as their message.
 */
export type SubAgentErrorKind =
  | "invalid_arguments" // caller passed missing/malformed args — fix and retry
  | "access_denied" // user cannot reach the target canvas — pick another
  | "step_limit" // worker hit its step budget mid-task — work may be partial
  | "empty_result" // worker finished without producing an answer
  | "model_error" // provider refused or failed the generation
  | "worker_execution" // the worker ran but threw/aborted — retryable
  | "worker_timeout" // the worker exceeded the action time limit
  | "infrastructure"; // backend/network failure — transient, retry later

/**
 * Shape carried in `ConvexError.data` so the category survives the
 * `ctx.runAction` boundary (plain `Error` messages are redacted to
 * "Server Error" when they cross it; `ConvexError.data` is preserved).
 *
 * `details` carries the evidence that used to be dropped on the floor: the
 * partial text of a worker that ran out of steps, a provider's response body,
 * the correlation id to grep for in the logs. It is optional so older payloads
 * still satisfy `asSubAgentErrorData`.
 */
export type SubAgentErrorData = {
  subAgentError: true;
  kind: SubAgentErrorKind;
  message: string;
  details?: string;
};

/** Actionable next-step hint appended to each kind for the parent model. */
const SUBAGENT_ERROR_GUIDANCE: Record<SubAgentErrorKind, string> = {
  invalid_arguments:
    "Fix the arguments before calling again — retrying unchanged will fail the same way.",
  access_denied:
    "This user cannot access that canvas. Call list_user_canvases for valid ids, or omit canvasId to run on the current canvas.",
  step_limit:
    "The worker ran out of steps before finishing, so it may have already applied PART of the changes. Inspect the canvas before retrying, then re-brief it on the remaining work only — do not replay the whole task blindly.",
  empty_result:
    "The worker completed without returning an answer. It may still have applied changes: check the canvas first. If nothing happened, retry with a brief that states explicitly what the final message must contain.",
  model_error:
    "The model provider refused or failed this generation. Retry once; if it repeats, shorten the brief (it may be too long for the context window) or do the task yourself.",
  worker_execution:
    "The worker started but failed while running. Retry once with a smaller, clearer brief; if it fails again, do the task yourself or tell the user.",
  worker_timeout:
    "The worker ran past the execution time limit and was killed, leaving any work half-applied. Do not retry the same brief — split it into smaller independent tasks, or do it yourself.",
  infrastructure:
    "Transient backend/network error, not caused by your inputs. Wait a moment and retry; if it persists, tell the user.",
};

/**
 * Evidence is only useful if it survives; a provider stack trace pasted whole
 * would evict the parent's context for no gain.
 */
const MAX_DETAILS_CHARS = 1200;

export function truncateDetails(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_DETAILS_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_DETAILS_CHARS)}… [truncated, ${trimmed.length} chars total]`;
}

/**
 * Build a `ConvexError` that carries a classified sub-agent failure. Throw this
 * from inside a Convex action so the parent tool can read `.data.kind`.
 */
export function subAgentConvexError(
  kind: SubAgentErrorKind,
  message: string,
  details?: string,
): ConvexError<SubAgentErrorData> {
  return new ConvexError({
    subAgentError: true,
    kind,
    message,
    ...(details ? { details: truncateDetails(details) } : {}),
  });
}

/** Type guard for a structured sub-agent error carried in `ConvexError.data`. */
export function asSubAgentErrorData(data: unknown): SubAgentErrorData | null {
  if (
    data !== null &&
    typeof data === "object" &&
    (data as { subAgentError?: unknown }).subAgentError === true &&
    typeof (data as { kind?: unknown }).kind === "string" &&
    typeof (data as { message?: unknown }).message === "string"
  ) {
    return data as SubAgentErrorData;
  }
  return null;
}

/**
 * Serialize a sub-agent failure into the tool-result string the parent model
 * reads. Keeps the `{ success: false, message }` contract other tools use (so
 * existing compaction still finds `.message`) while adding `errorKind` and
 * `guidance` so the model knows whether and how to retry.
 */
export function subAgentToolError(
  kind: SubAgentErrorKind,
  message: string,
  details?: string,
): string {
  return JSON.stringify({
    success: false,
    errorKind: kind,
    message,
    ...(details ? { details: truncateDetails(details) } : {}),
    guidance: SUBAGENT_ERROR_GUIDANCE[kind],
  });
}

/**
 * Human-readable reason behind a provider HTTP status. The status alone tells
 * the parent model nothing; "429" versus "the provider rate-limited us" is the
 * difference between a blind retry and a sensible one.
 */
function describeProviderStatus(status: number | undefined): string {
  switch (status) {
    case 400:
    case 413:
    case 422:
      return " — request rejected, the brief is probably too long for the model's context window";
    case 401:
    case 403:
      return " — credentials rejected, check OPENROUTER_API_KEY on the deployment";
    case 402:
      return " — the provider account is out of credit";
    case 404:
      return " — model not found, the configured model may have been retired by OpenRouter";
    case 408:
      return " — the provider itself timed out";
    case 429:
      return " — rate-limited by the provider";
    default:
      return status !== undefined && status >= 500
        ? " — the provider is failing, nothing to fix on our side"
        : "";
  }
}

/**
 * AI SDK errors that mean the *worker* misused its tools, as opposed to the
 * provider failing. Retrying with a clearer brief can fix these.
 */
const TOOL_MISUSE_ERROR_NAMES = new Set([
  "AI_NoSuchToolError",
  "AI_InvalidToolInputError",
  "AI_ToolCallRepairError",
  "AI_InvalidToolApprovalError",
  "AI_MissingToolResultsError",
  "AI_ToolCallNotFoundForApprovalError",
]);

/** AI SDK errors that are transient and unrelated to what we sent. */
const TRANSIENT_ERROR_NAMES = new Set(["AI_RetryError", "AI_DownloadError"]);

function looksLikeTimeout(message: string): boolean {
  return /timed?\s?out|timeout|exceeded the time limit/i.test(message);
}

/**
 * Turn whatever `generateText` threw into a classified failure, while the error
 * object is still intact.
 *
 * This has to happen *inside* the worker action: once a non-`ConvexError`
 * crosses `ctx.runAction`, Convex redacts it to "Server Error" and every cause
 * becomes indistinguishable. Classifying here is what keeps `infrastructure`
 * meaning "genuinely unknown" instead of "anything that wasn't hand-wrapped".
 */
export function classifyWorkerThrow(error: unknown): {
  kind: SubAgentErrorKind;
  message: string;
  details?: string;
} {
  if (error instanceof ConvexError) {
    const data = asSubAgentErrorData(error.data);
    if (data) {
      return { kind: data.kind, message: data.message, details: data.details };
    }
    // A tool inside the worker threw a plain ConvexError: that is the worker's
    // own logic failing, and `data` already holds the message worth surfacing.
    if (typeof error.data === "string" && error.data.length > 0) {
      return { kind: "worker_execution", message: error.data };
    }
  }

  if (APICallError.isInstance(error)) {
    const { statusCode, responseBody } = error;
    return {
      // 5xx (or no status at all) is the provider being down; anything below
      // that is a call we shaped wrong and could shape differently.
      kind:
        statusCode !== undefined && statusCode < 500
          ? "model_error"
          : "infrastructure",
      message: `Model provider call failed${
        statusCode !== undefined ? ` with HTTP ${statusCode}` : ""
      }${describeProviderStatus(statusCode)}.`,
      details: typeof responseBody === "string" ? responseBody : undefined,
    };
  }

  if (AISDKError.isInstance(error)) {
    const kind: SubAgentErrorKind = TOOL_MISUSE_ERROR_NAMES.has(error.name)
      ? "worker_execution"
      : TRANSIENT_ERROR_NAMES.has(error.name)
        ? "infrastructure"
        : "model_error";
    return {
      kind,
      message: `${error.name}: ${error.message}`,
      details: error.cause ? String(error.cause) : undefined,
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  if (looksLikeTimeout(message)) {
    return { kind: "worker_timeout", message };
  }
  return { kind: "worker_execution", message };
}
