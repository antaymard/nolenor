import { useCallback, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { optimisticallySendMessage } from "@convex-dev/agent/react";
import { useReactFlow, useStore } from "@xyflow/react";
import { useParams } from "@tanstack/react-router";
import toast from "react-hot-toast";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { CanvasNode } from "@/types";
import type { ChatModelValues } from "@/types/convex";
import { useNoleStore } from "@/stores/noleStore";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useWindowsStore } from "@/stores/windowsStore";
import { useNoleThread } from "@/hooks/useNoleThread";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { getCanvasNodeTitle } from "@/lib/getCanvasNodeTitle";
import { generateMessageContext } from "@/components/canvas/nole-panel/messageContextGenerator";

export function useNoleChat() {
  const {
    threadId: initialThreadId,
    isLoading,
    resetThread,
  } = useNoleThread({
    subscribeToLatestThread: false,
  });
  const { canvasId } = useParams({ strict: false }) as {
    canvasId?: Id<"canvases">;
  };

  const [overrideThreadId, setOverrideThreadId] = useState<string | null>(null);
  const threadId = overrideThreadId ?? initialThreadId;
  const modelOptions = useQuery(api.ia.nole.listChatModels, {});

  const [userInput, setUserInput] = useState("");
  const [manualModelSelection, setManualModelSelection] = useState<{
    threadId: string;
    model: ChatModelValues;
  } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const attachedNodes = useNoleStore((state) => state.attachedNodes);
  const attachedPosition = useNoleStore((state) => state.attachedPosition);
  const addAttachments = useNoleStore((state) => state.addAttachments);
  const removeAttachments = useNoleStore((state) => state.removeAttachments);
  const resetAttachments = useNoleStore((state) => state.resetAttachments);

  const onTranscript = useCallback(
    (text: string) => setUserInput((prev) => (prev ? prev + " " + text : text)),
    [],
  );
  const {
    status: sttStatus,
    start: startSTT,
    stop: stopSTT,
  } = useSpeechToText(onTranscript);
  const isRecording = sttStatus === "recording";
  const isTranscribing = sttStatus === "transcribing";
  const sttBusy = isRecording || isTranscribing;

  const threadMessageMetadata = useQuery(
    api.messageMetadata.getThreadMessageMetadata,
    threadId ? { threadId } : "skip",
  );

  const lastUsedModel = useMemo<ChatModelValues | undefined>(() => {
    return threadMessageMetadata?.lastModelUsed as ChatModelValues | undefined;
  }, [threadMessageMetadata]);

  const selectedModel: ChatModelValues | undefined = useMemo(() => {
    if (manualModelSelection && manualModelSelection.threadId === threadId) {
      return manualModelSelection.model;
    }
    return lastUsedModel ?? modelOptions?.[0]?.value;
  }, [manualModelSelection, threadId, lastUsedModel, modelOptions]);

  const setSelectedModel = useCallback(
    (model: ChatModelValues) => {
      if (!threadId) return;
      setManualModelSelection({ threadId, model });
    },
    [threadId],
  );

  // isAssistantResponding is lifted from ChatInterface (which already
  // subscribes to useUIMessages) to avoid a duplicate streaming subscription
  // re-rendering ChatContainer on every token.
  const [isAssistantResponding, setIsAssistantResponding] = useState(false);

  const sendMessage = useMutation(api.ia.nole.saveMessage).withOptimisticUpdate(
    optimisticallySendMessage(api.threads.listMessages),
  );
  const abortStream = useMutation(api.threads.abortStream);
  const updateThreadTitle = useAction(api.threads.updateThreadTitle);
  const threadInfo = useQuery(
    api.threads.getThreadInfo,
    threadId ? { threadId } : "skip",
  );

  const dirtyNodeIds = useWindowsStore((s) => s.dirtyNodeIds);
  const openedWindows = useWindowsStore((s) => s.openedWindows);
  const hasDirtyWindows = dirtyNodeIds.length > 0;
  const nodeDatas = useNodeDataStore((state) => state.nodeDatas);
  const reactFlow = useReactFlow();

  // Subscribe only to the SET of selected node ids. Selecting a string allows
  // referential equality to skip re-renders when selection is unchanged
  // (e.g. on pan/zoom/drag/node-position updates).
  const selectedNodeIdsKey = useStore((s) =>
    s.nodes
      .filter((n) => n.selected)
      .map((n) => n.id)
      .join(","),
  );
  const selectableNodes = useMemo(() => {
    const attachedNodeIds = new Set(attachedNodes.map((node) => node.id));
    return (reactFlow.getNodes() as CanvasNode[]).filter(
      (n) => n.selected && !attachedNodeIds.has(n.id),
    );
    // selectedNodeIdsKey is the dependency that drives reactivity here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeIdsKey, attachedNodes, reactFlow]);

  const sendCurrentMessage = useCallback(async () => {
    if (
      !threadId ||
      !canvasId ||
      !userInput.trim() ||
      isSending ||
      isAssistantResponding ||
      hasDirtyWindows ||
      sttBusy
    ) {
      return;
    }

    const prompt = userInput;
    const {
      x: viewportX,
      y: viewportY,
      zoom: viewportZoom,
    } = reactFlow.getViewport();
    const messageContext = generateMessageContext({
      nodes: reactFlow.getNodes() as CanvasNode[],
      openedNodeIds: openedWindows.map((openedWindow) => openedWindow.xyNodeId),
      attachedNodes,
      attachedPosition,
      viewport: {
        x: viewportX,
        y: viewportY,
        zoom: viewportZoom,
      },
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      getNodeTitle: (node) => getCanvasNodeTitle(node, nodeDatas),
    });
    setUserInput("");
    setIsSending(true);

    try {
      await sendMessage({
        threadId,
        prompt,
        metadata: {
          messageContext,
          model: selectedModel,
        },
        canvasId,
      });
      resetAttachments();
      void updateThreadTitle({ threadId, onlyIfUntitled: true });
    } catch (error) {
      console.error("Erreur lors de l'envoi:", error);
      setUserInput(prompt);
      toast.error("Impossible d'envoyer le message. Réessayez.", {
        position: "bottom-left",
      });
    } finally {
      setIsSending(false);
    }
  }, [
    threadId,
    canvasId,
    userInput,
    isSending,
    isAssistantResponding,
    hasDirtyWindows,
    sttBusy,
    reactFlow,
    openedWindows,
    attachedNodes,
    attachedPosition,
    nodeDatas,
    sendMessage,
    selectedModel,
    resetAttachments,
    updateThreadTitle,
  ]);

  const startNewThread = useCallback(async () => {
    setOverrideThreadId(null);
    setUserInput("");
    resetAttachments();
    await resetThread();
  }, [resetAttachments, resetThread]);

  const stopAssistantResponse = useCallback(async () => {
    if (!threadId || !isAssistantResponding || isCancelling) {
      return;
    }

    setIsCancelling(true);
    try {
      const result = await abortStream({ threadId });
      if (!result.aborted) {
        toast("Aucun stream actif a interrompre", {
          position: "bottom-left",
        });
      }
    } catch (error) {
      console.error("Erreur lors de l'interruption du stream:", error);
      toast.error("Impossible d'interrompre la reponse en cours", {
        position: "bottom-left",
      });
    } finally {
      setIsCancelling(false);
    }
  }, [threadId, isAssistantResponding, isCancelling, abortStream]);

  const selectThread = useCallback(
    (selectedThreadId: string | null) => {
      setOverrideThreadId(selectedThreadId);
      setUserInput("");
      resetAttachments();
    },
    [resetAttachments],
  );

  return {
    // thread
    threadId,
    threadInfo,
    isLoading,
    selectThread,
    startNewThread,
    // input
    userInput,
    setUserInput,
    // sending
    sendCurrentMessage,
    isSending,
    isAssistantResponding,
    setIsAssistantResponding,
    isCancelling,
    stopAssistantResponse,
    // model
    modelOptions,
    selectedModel,
    setSelectedModel,
    // attachments
    attachedNodes,
    attachedPosition,
    selectableNodes,
    addAttachments,
    removeAttachments,
    // stt
    sttStatus,
    isRecording,
    isTranscribing,
    sttBusy,
    startSTT,
    stopSTT,
    // dirty windows
    dirtyNodeIds,
    hasDirtyWindows,
  };
}
