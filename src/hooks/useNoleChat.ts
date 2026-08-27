import { useCallback, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { optimisticallySendMessage } from "@convex-dev/agent/react";
import { useReactFlow } from "@xyflow/react";
import { useParams } from "@tanstack/react-router";
import toast from "react-hot-toast";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { CanvasNode } from "@/types";
import type { ChatModelValues } from "@/types/convex";
import { useNoleStore } from "@/stores/noleStore";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useTemplatesStore } from "@/stores/templatesStore";
import { useWindowsStore } from "@/stores/windowsStore";
import { useNoleThread } from "@/hooks/useNoleThread";
import { useResolvedRunStatus } from "@/hooks/useThreadRunStatus";
import { useNoleModelSelection } from "@/hooks/useNoleModelSelection";
import { useNoleSpeechInput } from "@/hooks/useNoleSpeechInput";
import { useSelectableNodes } from "@/hooks/useSelectableNodes";
import { getCanvasNodeTitle } from "@/lib/getCanvasNodeTitle";
import { generateMessageContext } from "@/components/canvas/nole-panel/messageContextGenerator";

/**
 * Top-level state for the Nolë chat: thread lifecycle, composer input, model
 * selection, attachments, speech input, sending and cancellation. Composed from
 * focused sub-hooks; the returned object is the single source of truth shared by
 * the desktop panel and the mobile screen.
 */
export function useNoleChat() {
  // `strict: false` : hors route canvas, `canvasId` est absent à l'exécution.
  const { canvasId } = useParams({ strict: false }) as {
    canvasId: Id<"canvases"> | undefined;
  };

  // Thread (with an in-session override to switch/select threads). The override
  // lives in the Nolë store so any surface (incl. the AssociatedThreads modal)
  // can open a thread in the panel; null falls back to the resolved initial.
  const {
    threadId: initialThreadId,
    isLoading,
    ensureThread,
    resetThread,
  } = useNoleThread({ canvasId });
  const overrideThreadId = useNoleStore((state) => state.activeThreadId);
  const setOverrideThreadId = useNoleStore((state) => state.setActiveThreadId);
  const setModelSelection = useNoleStore((state) => state.setModelSelection);
  const threadId = overrideThreadId ?? initialThreadId;

  // L'override est remis à zéro au changement de canvas par `useCanvasBootstrap`,
  // et non ici : cet effet-ci se déclenchait au *montage du chat*, donc à chaque
  // ouverture du panneau — il effaçait la conversation qu'on venait de désigner
  // depuis l'extérieur (dock d'activité, threads associés d'un node) et ouvrait
  // le dernier thread du canvas à la place.

  // Composer input.
  const [userInput, setUserInput] = useState("");

  // Model selection (driven by the thread's last-used model).
  const modelOptions = useQuery(api.ia.nole.listChatModels, {});
  const threadUsageSummary = useQuery(
    api.messageMetadata.getThreadUsageSummary,
    threadId ? { threadId } : "skip",
  );

  // `lastModelUsed` est la chaîne rapportée par le provider, pas forcément un
  // slug encore proposé. Le renvoyer tel quel à `saveMessage`, dont le
  // validateur est une union stricte, ferait échouer l'envoi sur un thread dont
  // le modèle a depuis quitté le catalogue : on ne le retient que s'il en fait
  // toujours partie, sinon on retombe sur le défaut.
  const lastUsedModel = useMemo<ChatModelValues | undefined>(() => {
    const last = threadUsageSummary?.lastModelUsed;
    if (!last) return undefined;
    return modelOptions?.find((option) => option.value === last)?.value;
  }, [threadUsageSummary?.lastModelUsed, modelOptions]);

  const { selectedModel, setSelectedModel, adoptDraftSelection } =
    useNoleModelSelection({
      canvasId,
      threadId,
      modelOptions,
      lastUsedModel,
    });

  // Speech-to-text → composer input (live streaming, fallback batch).
  const speech = useNoleSpeechInput(userInput, setUserInput);

  // Attachments (canvas nodes / position) from the Nolë store.
  const attachedNodes = useNoleStore((state) => state.attachedNodes);
  const attachedPosition = useNoleStore((state) => state.attachedPosition);
  const addAttachments = useNoleStore((state) => state.addAttachments);
  const removeAttachments = useNoleStore((state) => state.removeAttachments);
  const resetAttachments = useNoleStore((state) => state.resetAttachments);
  const selectableNodes = useSelectableNodes(attachedNodes);

  // Sending / cancellation.
  const [isSending, setIsSending] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const sendMessage = useMutation(api.ia.nole.saveMessage).withOptimisticUpdate(
    optimisticallySendMessage(api.threads.listMessages),
  );
  const abortStream = useMutation(api.threads.abortStream);
  const updateThreadTitle = useAction(api.threads.updateThreadTitle);
  const threadInfo = useQuery(
    api.threads.getThreadInfo,
    threadId ? { threadId } : "skip",
  );

  // L'état du tour vient du serveur, pas du flux de messages : c'est ce qui
  // permet de le connaître pour un thread dont aucune conversation n'est
  // affichée, et ce qui met d'accord les cinq surfaces qui montent ce hook.
  //
  // Remplace un drapeau remonté de ChatInterface, qui devait mémoriser *quel*
  // thread répondait : démonté à l'ouverture d'une conversation vierge, il
  // n'avait plus aucun moyen de se remettre à false et bloquait l'envoi.
  const runStatus = useResolvedRunStatus(threadInfo);
  const isAssistantResponding = runStatus === "running";

  // Dirty windows block sending until saved/closed.
  const dirtyNodeIds = useWindowsStore((s) => s.dirtyNodeIds);
  const openedWindows = useWindowsStore((s) => s.openedWindows);
  const hasDirtyWindows = dirtyNodeIds.length > 0;

  const nodeDatas = useNodeDataStore((state) => state.nodeDatas);
  const reactFlow = useReactFlow();

  const sendCurrentMessage = useCallback(async () => {
    // `threadId` peut être null : la conversation est vierge et le thread sera
    // créé par `ensureThread` ci-dessous.
    if (
      !canvasId ||
      !userInput.trim() ||
      isSending ||
      isAssistantResponding ||
      hasDirtyWindows ||
      speech.sttBusy
    ) {
      return;
    }

    const prompt = userInput;
    const viewport = reactFlow.getViewport();
    const messageContext = generateMessageContext({
      nodes: reactFlow.getNodes() as CanvasNode[],
      openedNodeIds: openedWindows.map((w) => w.xyNodeId),
      attachedNodes,
      attachedPosition,
      viewport,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      // Lecture ponctuelle à l'envoi du message (pas un rendu) : getState()
      // est le bon choix ici, contrairement aux chips qui, eux, souscrivent.
      getNodeTitle: (node) =>
        getCanvasNodeTitle(
          node,
          nodeDatas,
          useTemplatesStore.getState().templates,
        ),
    });

    setUserInput("");
    setIsSending(true);
    try {
      // Une conversation reprise depuis l'historique prime ; sinon on résout le
      // thread du canvas, quitte à le créer maintenant.
      const activeThreadId = overrideThreadId ?? (await ensureThread());
      // Le message part déjà avec le bon modèle (`selectedModel` est capturé
      // avant l'await) ; on rattache le choix au thread qui vient de naître pour
      // que l'UI ne retombe pas sur le défaut dans la foulée.
      adoptDraftSelection(activeThreadId);
      await sendMessage({
        threadId: activeThreadId,
        prompt,
        metadata: { messageContext, model: selectedModel },
        canvasId,
      });
      resetAttachments();
      void updateThreadTitle({
        threadId: activeThreadId,
        onlyIfUntitled: true,
      });
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
    canvasId,
    userInput,
    isSending,
    isAssistantResponding,
    hasDirtyWindows,
    speech.sttBusy,
    reactFlow,
    openedWindows,
    attachedNodes,
    attachedPosition,
    nodeDatas,
    overrideThreadId,
    ensureThread,
    adoptDraftSelection,
    sendMessage,
    selectedModel,
    resetAttachments,
    updateThreadTitle,
  ]);

  const stopAssistantResponse = useCallback(async () => {
    if (!threadId || !isAssistantResponding || isCancelling) return;

    setIsCancelling(true);
    try {
      const result = await abortStream({ threadId });
      if (!result.aborted) {
        toast("Aucun stream actif a interrompre", { position: "bottom-left" });
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

  // Rien n'est écrit en base : on remet une conversation vierge, le thread sera
  // créé au premier message.
  const startNewThread = useCallback(() => {
    setOverrideThreadId(null);
    setModelSelection(null);
    setUserInput("");
    resetAttachments();
    resetThread();
  }, [resetAttachments, resetThread, setOverrideThreadId, setModelSelection]);

  const selectThread = useCallback(
    (selectedThreadId: string | null) => {
      setOverrideThreadId(selectedThreadId);
      setUserInput("");
      resetAttachments();
    },
    [resetAttachments, setOverrideThreadId],
  );

  return {
    // canvas
    canvasId,
    // thread
    threadId,
    threadInfo,
    runStatus,
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
    // speech-to-text
    sttStatus: speech.sttStatus,
    isRecording: speech.isRecording,
    isTranscribing: speech.isTranscribing,
    sttBusy: speech.sttBusy,
    startSTT: speech.startSTT,
    stopSTT: speech.stopSTT,
    micLevel: speech.micLevel,
    // dirty windows
    dirtyNodeIds,
    hasDirtyWindows,
  };
}
