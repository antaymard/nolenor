import { useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import type { UIMessage } from "@convex-dev/agent/react";
import { api } from "@/../convex/_generated/api";
import type { Doc } from "@/../convex/_generated/dataModel";

/**
 * Loads per-message metadata (model, usage, attachments, …) for a thread and
 * returns a lookup keyed to the streamed UI messages.
 *
 * User metadata is matched by message id; assistant metadata has no stable id
 * on the streamed messages, so it is aligned by creation order instead.
 */
export function useThreadMessageMetadata(
  threadId: string | undefined,
  messages: readonly UIMessage[],
) {
  const data = useQuery(
    api.messageMetadata.getThreadMessageMetadata,
    threadId ? { threadId } : "skip",
  );
  const rows = useMemo(() => data?.messageMetadata ?? [], [data]);

  const userMetadataById = useMemo(() => {
    const map = new Map<string, Doc<"messageMetadata">>();
    for (const row of rows) map.set(row.messageId, row);
    return map;
  }, [rows]);

  const assistantMetadataByKey = useMemo(() => {
    const assistantRows = rows
      .filter((row) => row.role === "assistant")
      .sort((a, b) => a._creationTime - b._creationTime);
    const map = new Map<string, Doc<"messageMetadata">>();
    messages
      .filter((m) => m.role === "assistant")
      .forEach((message, index) => {
        const row = assistantRows[index];
        if (row) map.set(message.key, row);
      });
    return map;
  }, [rows, messages]);

  return useCallback(
    (message: UIMessage): Doc<"messageMetadata"> | undefined =>
      message.role === "user"
        ? userMetadataById.get(message.id)
        : assistantMetadataByKey.get(message.key),
    [userMetadataById, assistantMetadataByKey],
  );
}
