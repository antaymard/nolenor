import { useCallback, useMemo, useState } from "react";
import type { ChatModelOption, ChatModelValues } from "@/types/convex";

/**
 * Resolves the active chat model for the current thread.
 *
 * Priority: an explicit manual choice for this thread → the last model used in
 * the thread → the first available model. The manual choice is scoped to the
 * thread it was made in, so switching threads falls back to that thread's own
 * last-used model.
 */
export function useNoleModelSelection({
  threadId,
  modelOptions,
  lastUsedModel,
}: {
  threadId: string | null | undefined;
  modelOptions: readonly ChatModelOption[] | undefined;
  lastUsedModel: ChatModelValues | undefined;
}) {
  const [manualSelection, setManualSelection] = useState<{
    threadId: string;
    model: ChatModelValues;
  } | null>(null);

  const selectedModel = useMemo<ChatModelValues | undefined>(() => {
    if (manualSelection && manualSelection.threadId === threadId) {
      return manualSelection.model;
    }
    return lastUsedModel ?? modelOptions?.[0]?.value;
  }, [manualSelection, threadId, lastUsedModel, modelOptions]);

  const setSelectedModel = useCallback(
    (model: ChatModelValues) => {
      if (!threadId) return;
      setManualSelection({ threadId, model });
    },
    [threadId],
  );

  return { selectedModel, setSelectedModel };
}
