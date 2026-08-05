import { useCallback, useEffect, useRef, useState } from "react";
import {
  useAction,
  useConvex,
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

/**
 * Au-delà de ce délai sans interaction, la conversation du canvas n'est plus
 * reprise (identique au panel web).
 */
const THREAD_REUSE_WINDOW_MS = 5 * 60 * 60 * 1000;

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

  const convex = useConvex();
  const startThreadMutation = useConvexMutation(api.threads.startThread);
  const threadInfo = useConvexQuery(
    api.threads.getThreadInfo,
    threadId ? { threadId } : "skip",
  );

  // Création en vol : deux envois rapprochés ne doivent pas créer deux threads.
  const pendingCreation = useRef<Promise<string> | null>(null);
  const currentThreadId = useRef<string | null>(null);
  // Incrémenté à chaque résolution : un thread créé pour le canvas A ne doit
  // pas être adopté si l'utilisateur est passé sur le canvas B entre-temps.
  const resolutionId = useRef(0);

  const setResolvedThreadId = useCallback((id: string | null) => {
    currentThreadId.current = id;
    setThreadId(id);
  }, []);

  useEffect(() => {
    if (!selectedModel && modelOptions && modelOptions.length > 0) {
      setSelectedModel(modelOptions[0]?.value);
    }
  }, [modelOptions, selectedModel]);

  // Résolution en lecture ponctuelle (pas d'abonnement) et rejouée au
  // changement de canvas : un sous-agent qui écrit en base ne doit pas faire
  // basculer la conversation affichée. Rien n'est créé ici : le thread naît à
  // l'envoi du premier message.
  useEffect(() => {
    resolutionId.current += 1;

    if (!selectedCanvasId) {
      setResolvedThreadId(null);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setResolvedThreadId(null);
    setOverrideThreadId(null);
    pendingCreation.current = null;

    convex
      .query(api.threads.getLatestCanvasThread, {
        canvasId: selectedCanvasId as Id<"canvases">,
      })
      .then((latest) => {
        if (cancelled) return;
        const isFresh =
          latest !== null &&
          Date.now() - latest.lastActivityTime < THREAD_REUSE_WINDOW_MS;
        setResolvedThreadId(isFresh ? latest.threadId : null);
      })
      .catch((error) => {
        if (!cancelled) console.error("Error resolving thread:", error);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [convex, selectedCanvasId, setResolvedThreadId]);

  /** Renvoie le thread courant, en le créant s'il n'existe pas encore. */
  const ensureThread = useCallback(async (): Promise<string> => {
    if (currentThreadId.current) return currentThreadId.current;
    if (pendingCreation.current) return pendingCreation.current;

    // L'appelant reçoit le thread créé dans tous les cas, mais on ne l'adopte
    // comme thread affiché que si on est toujours sur ce canvas.
    const startedFor = resolutionId.current;
    const creation = startThreadMutation({
      canvasId: selectedCanvasId as Id<"canvases">,
    })
      .then(({ threadId: created }) => {
        if (resolutionId.current === startedFor) setResolvedThreadId(created);
        return created;
      })
      .finally(() => {
        pendingCreation.current = null;
      });

    pendingCreation.current = creation;
    return creation;
  }, [selectedCanvasId, startThreadMutation, setResolvedThreadId]);

  const effectiveThreadId = overrideThreadId ?? threadId;

  const sendMessageMutation = useConvexMutation(
    api.ia.nole.saveMessage,
  ).withOptimisticUpdate(optimisticallySendMessage(api.threads.listMessages));
  const abortStreamMutation = useConvexMutation(api.threads.abortStream);
  const updateThreadTitleMutation = useAction(api.threads.updateThreadTitle);

  const sendCurrentMessage = useCallback(async () => {
    // `effectiveThreadId` peut être null : la conversation est vierge et le
    // thread sera créé par `ensureThread` ci-dessous.
    if (
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
      // Une conversation reprise depuis l'historique prime ; sinon on résout le
      // thread du canvas, quitte à le créer maintenant.
      const activeThreadId = overrideThreadId ?? (await ensureThread());
      await sendMessageMutation({
        threadId: activeThreadId,
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
        threadId: activeThreadId,
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
    overrideThreadId,
    ensureThread,
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

  // Rien n'est écrit en base : le thread sera créé au premier message.
  const startNewThread = useCallback(() => {
    setOverrideThreadId(null);
    setUserInput("");
    pendingCreation.current = null;
    setResolvedThreadId(null);
  }, [setResolvedThreadId]);

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
