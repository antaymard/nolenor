import { useCallback, useEffect, useRef } from "react";
import ChatInput from "./ChatInput";
import { Button } from "@/components/shadcn/button";
import { TbDatabase, TbLoader, TbPlus, TbX } from "react-icons/tb";
import ChatInterface from "./ChatInterface";
import ThreadSelector from "./ThreadSelector";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import toast from "react-hot-toast";
import { useNoleChat } from "@/hooks/useNoleChat";
import { useThreadStats } from "@/hooks/useThreadStats";
import { getModelLabel } from "@/lib/getModelLabel";
import type { ChatModelOption } from "@/types/convex";

type ChatContainerProps = {
  onClose?: () => void;
};

export default function ChatContainer({ onClose }: ChatContainerProps) {
  const {
    threadId,
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
    attachedNodes,
    attachedPosition,
    selectableNodes,
    addAttachments,
    removeAttachments,
    isRecording,
    isTranscribing,
    sttBusy,
    startSTT,
    stopSTT,
    dirtyNodeIds,
    hasDirtyWindows,
    threadInfo,
  } = useNoleChat();

  // Desktop push-to-talk: hold Ctrl+Alt
  const keysHeldRef = useRef<Set<string>>(new Set());
  const sttActiveRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysHeldRef.current.add(e.key);
      if (
        keysHeldRef.current.has("Control") &&
        keysHeldRef.current.has("Alt") &&
        !sttActiveRef.current
      ) {
        sttActiveRef.current = true;
        void startSTT();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysHeldRef.current.delete(e.key);
      if (
        sttActiveRef.current &&
        (!keysHeldRef.current.has("Control") || !keysHeldRef.current.has("Alt"))
      ) {
        sttActiveRef.current = false;
        stopSTT();
      }
    };
    const handleBlur = () => {
      keysHeldRef.current.clear();
      if (sttActiveRef.current) {
        sttActiveRef.current = false;
        stopSTT();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [startSTT, stopSTT]);

  const handleRetry = useCallback(
    (userMessage: string) => setUserInput(userMessage),
    [setUserInput],
  );

  const handleSend = () => {
    if (hasDirtyWindows) {
      toast.error(
        "Veuillez enregistrer ou fermer les fenêtres modifiées avant d'envoyer votre message.",
        { position: "bottom-left", duration: 5000 },
      );
      return;
    }
    void sendCurrentMessage();
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500">
        <TbLoader className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!threadId) {
    return (
      <div className="w-full h-full flex items-center justify-center text-slate-500">
        Error loading chat
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col shadow-2xl/10">
      {/* Header */}
      <div className="pl-2 rounded-t-lg border-b flex items-center justify-between gap-2">
        <p className="text-sm font-medium truncate flex-1">
          {threadInfo?.title || "Untitled"}
        </p>
        <ThreadStatsBadge
          threadId={threadId}
          selectedModel={selectedModel}
          modelOptions={modelOptions}
        />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => void startNewThread()}
          >
            <TbPlus size={14} />
          </Button>
          {threadId ? (
            <ThreadSelector
              currentThreadId={threadId}
              onSelectThread={selectThread}
            />
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onClose?.()}
            aria-label="Close panel"
          >
            <TbX size={15} />
          </Button>
        </div>
      </div>

      {/* Chat */}
      <div className="w-full flex-1 min-h-0">
        <ChatInterface
          threadId={threadId}
          onRetry={handleRetry}
          onAssistantRespondingChange={setIsAssistantResponding}
        />
      </div>

      <ChatInput
        userInput={userInput}
        setUserInput={setUserInput}
        onSend={handleSend}
        isSending={isSending}
        isAssistantResponding={isAssistantResponding}
        isCancelling={isCancelling}
        onStopAssistantResponse={stopAssistantResponse}
        modelOptions={modelOptions}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        selectableNodes={selectableNodes}
        attachedNodes={attachedNodes}
        attachedPosition={attachedPosition}
        addAttachments={addAttachments}
        removeAttachments={removeAttachments}
        isRecording={isRecording}
        isTranscribing={isTranscribing}
        sttBusy={sttBusy}
        dirtyNodeIds={dirtyNodeIds}
        hasDirtyWindows={hasDirtyWindows}
      />
    </div>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function formatCost(n: number): string {
  if (n === 0) return "$0";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(3)}`;
}

function ThreadStatsBadge({
  threadId,
  selectedModel,
  modelOptions,
}: {
  threadId: string | null | undefined;
  selectedModel: string | undefined;
  modelOptions: readonly ChatModelOption[] | undefined;
}) {
  const stats = useThreadStats({ threadId, selectedModel, modelOptions });

  if (stats.isLoading || stats.contextWindowUsed === 0) return null;

  const percentLabel =
    stats.contextPercent !== undefined
      ? `${stats.contextPercent < 1 ? stats.contextPercent.toFixed(1) : Math.round(stats.contextPercent)}%`
      : null;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 px-1.5 py-0.5 rounded-sm hover:bg-slate-100 cursor-default">
          <TbDatabase size={10} />
          {percentLabel ? <span>{percentLabel}</span> : null}
          {stats.totalCostUsd > 0 ? (
            <span>· {formatCost(stats.totalCostUsd)}</span>
          ) : null}
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-xs max-w-xs">
        <div className="flex flex-col gap-1">
          <p className="font-medium">Thread usage</p>
          {stats.perModel.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {stats.perModel.map((m) => (
                <div key={m.model} className="flex justify-between gap-2">
                  <span>{getModelLabel(m.model, modelOptions)}</span>
                  <span className="text-slate-300">
                    {formatTokens(m.totalTokens)} tk
                    {m.costUsd > 0 ? ` · ${formatCost(m.costUsd)}` : ""}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
          <p className="text-slate-300 mt-1">
            Contexte actuel : {formatTokens(stats.contextWindowUsed)} tk
            {stats.maxContext ? ` / ${formatTokens(stats.maxContext)} tk` : ""}
          </p>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
