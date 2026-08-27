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
 * on the streamed messages, so it is joined on the turn index (`order`), which
 * `recordAssistantUsage` writes for exactly that purpose. A turn writes a
 * single row but can render several messages (tool calls), and an aborted
 * stream writes none: aligning by position would drift for good and show an
 * earlier turn's model.
 */
export function useThreadMessageMetadata(threadId: string | undefined) {
  const data = useQuery(
    api.messageMetadata.listThreadMessageMetadata,
    threadId ? { threadId } : "skip",
  );
  const rows = useMemo(() => data ?? [], [data]);

  const userMetadataById = useMemo(() => {
    const map = new Map<string, Doc<"messageMetadata">>();
    for (const row of rows) map.set(row.messageId, row);
    return map;
  }, [rows]);

  const assistantMetadataByOrder = useMemo(() => {
    const map = new Map<number, Doc<"messageMetadata">>();
    for (const row of rows) {
      // `order` is optional: rows written before it existed are skipped, and
      // the footer simply isn't rendered for those messages.
      if (row.role === "assistant" && row.order !== undefined) {
        map.set(row.order, row);
      }
    }
    return map;
  }, [rows]);

  return useCallback(
    (message: UIMessage): Doc<"messageMetadata"> | undefined =>
      message.role === "user"
        ? userMetadataById.get(message.id)
        : assistantMetadataByOrder.get(message.order),
    [userMetadataById, assistantMetadataByOrder],
  );
}
