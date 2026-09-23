import type { UIMessage } from "@convex-dev/agent/react";
import { matchesLlmIdFormat } from "@/../convex/lib/llmId";

/** Lifecycle state of a `tool-*` message part (AI SDK v6). */
export type ToolPartState =
  | "input-streaming"
  | "input-available"
  | "approval-requested"
  | "approval-responded"
  | "output-available"
  | "output-error"
  | "output-denied";

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

export function getToolPartErrorText(
  part: unknown,
  state: ToolPartState,
): string | undefined {
  if (!isRecord(part)) return undefined;

  const directError = readErrorLike(part.errorText) ?? readErrorLike(part.error);
  if (directError) return directError;

  if (state === "output-error") return readErrorLike(part.output);
  return undefined;
}

/**
 * Les tools signalent la plupart de leurs échecs *dans* leur sortie
 * (`toolError` → `{"success":false,"message":…}` sérialisé) plutôt qu'en
 * throwant : le SDK les voit donc en `output-available`. Sans cette lecture,
 * un appel raté s'afficherait comme réussi.
 */
export function readSoftToolError(output: unknown): string | undefined {
  const value = parseJsonLike(output);
  if (!isRecord(value) || value.success !== false) return undefined;
  return readErrorLike(value) ?? "The tool reported a failure.";
}

/** Parse une chaîne JSON (objet ou tableau) ; rend la valeur telle quelle sinon. */
export function parseJsonLike(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

export function stringifyForDebug(value: unknown): string {
  value = parseJsonLike(value);
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/**
 * Extracts node IDs from a tool call's input args and (for `create_node`)
 * its output, so the UI can render node pills. Only known nodeId-bearing
 * fields are inspected — no regex sweep over the full JSON — to avoid
 * false positives from titles, content, or JSON keys.
 */
export function extractToolNodeIds(
  name: string,
  input: unknown,
  output: unknown,
): string[] {
  const ids = new Set<string>();

  const pushIfValid = (value: unknown) => {
    if (typeof value === "string" && value && matchesLlmIdFormat(value)) {
      ids.add(value);
    }
  };

  if (isRecord(input)) {
    pushIfValid(input.nodeId);
    if (Array.isArray(input.nodeIds)) {
      input.nodeIds.forEach(pushIfValid);
    }
    pushIfValid(input.sourceNodeId);
    pushIfValid(input.targetNodeId);
    pushIfValid(input.anchorNodeId);
    if (Array.isArray(input.sourceNodes)) {
      // `create_node` accepte un id nu ou `{ nodeId, label }`.
      input.sourceNodes.forEach((entry) =>
        pushIfValid(isRecord(entry) ? entry.nodeId : entry),
      );
    }
  }

  if (name === "create_node" && isRecord(output)) {
    pushIfValid(output.nodeId);
  }

  return [...ids];
}
