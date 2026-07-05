import { ConvexError } from "convex/values";

/**
 * Failure categories for the sub-agent launcher.
 *
 * Splitting failures into kinds lets us do two things the old single-string
 * error could not: log the *real* cause on the backend, and hand the parent
 * model a message it can actually act on — distinguishing "you passed bad
 * arguments" (fix them) from "the worker crashed" or "the backend is down"
 * (retry, not your fault).
 */
export type SubAgentErrorKind =
  | "invalid_arguments" // caller passed missing/malformed args — fix and retry
  | "access_denied" // user cannot reach the target canvas — pick another
  | "worker_execution" // the worker ran but threw/aborted — retryable
  | "infrastructure"; // model/backend/network failure — transient, retry later

/**
 * Shape carried in `ConvexError.data` so the category survives the
 * `ctx.runAction` boundary (plain `Error` messages are redacted to
 * "Server Error" when they cross it; `ConvexError.data` is preserved).
 */
export type SubAgentErrorData = {
  subAgentError: true;
  kind: SubAgentErrorKind;
  message: string;
};

/** Actionable next-step hint appended to each kind for the parent model. */
const SUBAGENT_ERROR_GUIDANCE: Record<SubAgentErrorKind, string> = {
  invalid_arguments:
    "Fix the arguments before calling again — retrying unchanged will fail the same way.",
  access_denied:
    "This user cannot access that canvas. Call list_user_canvases for valid ids, or omit canvasId to run on the current canvas.",
  worker_execution:
    "The worker started but failed while running. Retry once with a smaller, clearer brief; if it fails again, do the task yourself or tell the user.",
  infrastructure:
    "Transient backend/model error, not caused by your inputs. Wait a moment and retry; if it persists, tell the user.",
};

/**
 * Build a `ConvexError` that carries a classified sub-agent failure. Throw this
 * from inside a Convex action so the parent tool can read `.data.kind`.
 */
export function subAgentConvexError(
  kind: SubAgentErrorKind,
  message: string,
): ConvexError<SubAgentErrorData> {
  return new ConvexError({ subAgentError: true, kind, message });
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
): string {
  return JSON.stringify({
    success: false,
    errorKind: kind,
    message,
    guidance: SUBAGENT_ERROR_GUIDANCE[kind],
  });
}
