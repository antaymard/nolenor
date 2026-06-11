import type { UIMessage } from "@convex-dev/agent/react";

/** Lifecycle state of a `tool-*` message part. */
export type ToolPartState =
  | "input-streaming"
  | "output-available"
  | "output-error";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Best-effort extraction of a human-readable error string from an unknown
 * error-like value (string, array, or object with common error keys).
 */
export function readErrorLike(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = readErrorLike(item);
      if (nested) return nested;
    }
    return undefined;
  }

  if (!isRecord(value)) return undefined;

  const keys = [
    "error",
    "message",
    "detail",
    "details",
    "cause",
    "reason",
    "statusText",
  ];
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      const text = candidate.trim();
      return text.length > 200 ? text.slice(0, 200) + "…" : text;
    }
  }
  return undefined;
}

export function getMessageErrorText(message: UIMessage): string | undefined {
  return readErrorLike((message as unknown as Record<string, unknown>).error);
}

/** The `explanation` tool input field, used as the human-readable label. */
export function getToolExplanation(input: unknown): string | undefined {
  if (!isRecord(input) || typeof input.explanation !== "string") {
    return undefined;
  }
  return input.explanation.trim() || undefined;
}

export function getToolFallbackLabel(
  state: ToolPartState,
  name: string,
): string {
  if (state === "input-streaming") return `Tool en cours: ${name}`;
  if (state === "output-error") return `Tool en erreur: ${name}`;
  return `Tool execute: ${name}`;
}

export function getToolPartErrorText(
  part: unknown,
  state: ToolPartState,
): string | undefined {
  if (!isRecord(part)) return undefined;

  const directError = readErrorLike(part.error);
  if (directError) return directError;

  if (state === "output-error") return readErrorLike(part.output);
  return undefined;
}

export function stringifyForDebug(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
