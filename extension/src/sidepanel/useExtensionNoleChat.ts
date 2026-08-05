import { useCallback, useEffect, useState } from "react";
import {
  useAction,
  useMutation as useConvexMutation,
  useQuery as useConvexQuery,
} from "convex/react";
import { optimisticallySendMessage } from "@convex-dev/agent/react";
import toast from "react-hot-toast";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useExtensionStore } from "./store";

type ChatModelOption = {
  label: string;
  value: string;
  price: string;
  isMultimodal: boolean;
};

export function useExtensionNoleChat() {
  const [threadId, setThreadId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userInput, setUserInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isAssistantResponding, setIsAssistantResponding] = useState(false);
  const [overrideThreadId, setOverrideThreadId] = useState<string | null>(null);

  const selectedCanvasId = useExtensionStore((s) => s.selectedCanvasId);
  const attachedPage = useExtensionStore((s) => s.attachedPage);
  const removeAttachedPage = useExtensionStore((s) => s.removeAttachedPage);

  const modelOptions = useConvexQuery(api.ia.nole.listChatModels, {}) as
    | ChatModelOption[]
    | undefined;
  const [selectedModel, setSelectedModel] = useState<string>();

  const latestThread = useConvexQuery(api.threads.getLatestThread);
  const startThreadMutation = useConvexMutation(api.threads.startThread);
  const threadInfo = useConvexQuery(
    api.threads.getThreadInfo,
    threadId ? { threadId } : "skip",
  );

  useEffect(() => {
    if (!selectedModel && modelOptions && modelOptions.length > 0) {
      setSelectedModel(modelOptions[0]?.value);
    }
  }, [modelOptions, selectedModel]);

  useEffect(() => {
    const initThread = async () => {
      try {
        if (latestThread !== undefined) {
          if (latestThread && "threadId" in latestThread) {
            setThreadId(latestThread.threadId);
          } else {
            const result = await startThreadMutation({
              canvasId: selectedCanvasId as Id<"canvases">,
            });
            setThreadId(result.threadId);
          }
        }
      } catch (error) {
        console.error("Error initializing thread:", error);
      } finally {
        setIsLoading(false);
      }
    };
    void initThread();
  }, [startThreadMutation, latestThread, selectedCanvasId]);

  const effectiveThreadId = overrideThreadId ?? threadId;

  const sendMessageMutation = useConvexMutation(
    api.ia.nole.saveMessage,
  ).withOptimisticUpdate(optimisticallySendMessage(api.threads.listMessages));
  const abortStreamMutation = useConvexMutation(api.threads.abortStream);
  const updateThreadTitleMutation = useAction(api.threads.updateThreadTitle);

  const sendCurrentMessage = useCallback(async () => {
    if (
      !effectiveThreadId ||
      !selectedCanvasId ||
      !userInput.trim() ||
      isSending ||
      isAssistantResponding
    ) {
      return;
    }

    const prompt = userInput;

    const messageContext: Record<string, unknown> = {};
    if (attachedPage) {
      messageContext.attachedPage = attachedPage;
    }

    setUserInput("");
    setIsSending(true);

    try {
      await sendMessageMutation({
        threadId: effectiveThreadId,
        prompt,
        metadata: {
          messageContext:
            Object.keys(messageContext).length > 0 ? messageContext : undefined,
          model: selectedModel,
        },
        canvasId: selectedCanvasId as Id<"canvases">,
      });
      removeAttachedPage();
      void updateThreadTitleMutation({
        threadId: effectiveThreadId,
        onlyIfUntitled: true,
      });
    } catch (error) {
      console.error("Error sending message:", error);
      setUserInput(prompt);
      toast.error("Unable to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  }, [
    effectiveThreadId,
    selectedCanvasId,
    userInput,
    isSending,
    isAssistantResponding,
    attachedPage,
    selectedModel,
    sendMessageMutation,
    removeAttachedPage,
    updateThreadTitleMutation,
  ]);

  const stopAssistantResponse = useCallback(async () => {
    if (!effectiveThreadId || !isAssistantResponding || isCancelling) return;
    setIsCancelling(true);
    try {
      await abortStreamMutation({ threadId: effectiveThreadId });
    } catch (error) {
      console.error("Error stopping response:", error);
    } finally {
      setIsCancelling(false);
    }
  }, [
    effectiveThreadId,
    isAssistantResponding,
    isCancelling,
    abortStreamMutation,
  ]);

  const startNewThread = useCallback(async () => {
    setOverrideThreadId(null);
    setUserInput("");
    setIsLoading(true);
    setThreadId(null);
    try {
      const result = await startThreadMutation({
        canvasId: selectedCanvasId as Id<"canvases">,
      });
      setThreadId(result.threadId);
    } catch (error) {
      console.error("Error starting new thread:", error);
    } finally {
      setIsLoading(false);
    }
  }, [startThreadMutation, selectedCanvasId]);

  const selectThread = useCallback((id: string) => {
    setOverrideThreadId(id);
    setUserInput("");
  }, []);

  return {
    threadId: effectiveThreadId,
    threadInfo,
    isLoading,
    userInput,
    setUserInput,
    sendCurrentMessage,
    isSending,
    isAssistantResponding,
    setIsAssistantResponding,
    isCancelling,
    stopAssistantResponse,
    selectThread,
    startNewThread,
    modelOptions,
    selectedModel,
    setSelectedModel,
  };
}
