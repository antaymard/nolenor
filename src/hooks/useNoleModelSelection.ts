import { useCallback, useMemo } from "react";
import { useNoleStore } from "@/stores/noleStore";
import type { ChatModelOption, ChatModelValues } from "@/types/convex";

/**
 * Key for a canvas' blank conversation, while no thread exists in the database
 * yet — the thread is only born when the first message is sent (lazy creation,
 * see `useNoleThread`). Without it a model picked before that first send would
 * have nothing to attach to. Scoped per canvas so a choice made on one canvas'
 * draft does not leak into another's.
 */
export function draftThreadKey(canvasId: string | undefined): string {
  return `draft:${canvasId ?? "none"}`;
}

/**
 * Resolves the active chat model for the current thread.
 *
 * Priority: an explicit manual choice for this conversation → the last model
 * used in the thread → the first available model. The manual choice is scoped
 * to the conversation it was made in, so switching threads falls back to that
 * thread's own last-used model, and a new conversation starts from the default.
 *
 * The choice lives in the Nolë store rather than in local state: the panel is
 * conditionally rendered, so collapsing it would otherwise discard it.
 */
export function useNoleModelSelection({
  canvasId,
  threadId,
  modelOptions,
  lastUsedModel,
}: {
  canvasId: string | undefined;
  threadId: string | null | undefined;
  modelOptions: readonly ChatModelOption[] | undefined;
  lastUsedModel: ChatModelValues | undefined;
}) {
  const manualSelection = useNoleStore((state) => state.modelSelection);
  const setManualSelection = useNoleStore((state) => state.setModelSelection);

  const draftKey = draftThreadKey(canvasId);
  const threadKey = threadId ?? draftKey;

  const selectedModel = useMemo<ChatModelValues | undefined>(() => {
    if (manualSelection && manualSelection.threadKey === threadKey) {
      return manualSelection.model;
    }
    return lastUsedModel ?? modelOptions?.[0]?.value;
  }, [manualSelection, threadKey, lastUsedModel, modelOptions]);

  const setSelectedModel = useCallback(
    (model: ChatModelValues) => {
      setManualSelection({ threadKey, model });
    },
    [threadKey, setManualSelection],
  );

  /**
   * The thread was just created from the blank conversation: re-key the choice
   * onto it. Without this, `threadId` going from `null` to the real id would
   * make the selection look like one made in another conversation, and the UI
   * would drop back to the default right after the send.
   *
   * Read through `getState()`: this runs after an `await`, so the value
   * captured in the closure would be stale.
   */
  const adoptDraftSelection = useCallback(
    (createdThreadId: string) => {
      const current = useNoleStore.getState().modelSelection;
      if (current?.threadKey !== draftKey) return;
      setManualSelection({ threadKey: createdThreadId, model: current.model });
    },
    [draftKey, setManualSelection],
  );

  return { selectedModel, setSelectedModel, adoptDraftSelection };
}
