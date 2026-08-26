import { useCallback } from "react";
import NoleIcon from "@/assets/svg-components/NoleIcon";
import { TbPlus, TbX } from "react-icons/tb";
import { ThinkingOrb } from "thinking-orbs";
import toast from "react-hot-toast";
import { Button } from "@/components/shadcn/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import { useNoleChat } from "@/hooks/useNoleChat";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import ChatInput from "./ChatInput";
import ChatInterface from "./ChatInterface";
import ThreadSelector from "./ThreadSelector";
import ThreadStatsBadge from "./ThreadStatsBadge";
import ThreadStatusPill from "./ThreadStatusPill";

type ChatContainerProps = {
  onClose?: () => void;
};

export default function ChatContainer({ onClose }: ChatContainerProps) {
  const chat = useNoleChat();
  const {
    threadId,
    threadInfo,
    isLoading,
    hasDirtyWindows,
    setUserInput,
    sendCurrentMessage,
    startSTT,
    stopSTT,
  } = chat;

  // Desktop push-to-talk: hold Ctrl+Alt.
  usePushToTalk({ onStart: startSTT, onStop: stopSTT });

  const handleRetry = useCallback(
    (userMessage: string) => setUserInput(userMessage),
    [setUserInput],
  );

  const handleSend = useCallback(() => {
    if (hasDirtyWindows) {
      toast.error(
        "Veuillez enregistrer ou fermer les fenêtres modifiées avant d'envoyer votre message.",
        { position: "bottom-left", duration: 5000 },
      );
      return;
    }
    void sendCurrentMessage();
  }, [hasDirtyWindows, sendCurrentMessage]);

  if (isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <ThinkingOrb state="breathing" size={20} aria-label="Chargement" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col shadow-2xl/10">
      {/* Header */}
      <div className="flex items-center gap-1 rounded-t-lg border-b border-slate-200 bg-white/60 py-1 pr-1 pl-3 backdrop-blur-sm">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700">
          {threadId ? threadInfo?.title || "Untitled chat" : "New chat"}
        </p>
        <ThreadStatusPill status={chat.runStatus} />
        <ThreadStatsBadge
          threadId={threadId}
          selectedModel={chat.selectedModel}
          modelOptions={chat.modelOptions}
        />
        <Tooltip delayDuration={400}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-slate-400 hover:text-slate-700"
              onClick={chat.startNewThread}
              aria-label="Nouvelle conversation"
            >
              <TbPlus size={15} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Nouvelle conversation</TooltipContent>
        </Tooltip>
        <ThreadSelector
          canvasId={chat.canvasId}
          currentThreadId={threadId}
          onSelectThread={chat.selectThread}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-slate-400 hover:text-slate-700"
          onClick={() => onClose?.()}
          aria-label="Close panel"
        >
          <TbX size={15} />
        </Button>
      </div>

      {/* Messages — pas de thread tant que le premier message n'est pas parti */}
      <div className="w-full flex-1 min-h-0">
        {threadId ? (
          <ChatInterface
            // Remonter à chaque conversation : l'état interne (scroll, flash
            // « Done », activité) ne doit pas déborder d'un thread sur l'autre.
            key={threadId}
            threadId={threadId}
            onRetry={handleRetry}
          />
        ) : (
          <EmptyThreadState />
        )}
      </div>

      {/* Composer */}
      <ChatInput
        userInput={chat.userInput}
        setUserInput={chat.setUserInput}
        onSend={handleSend}
        isSending={chat.isSending}
        isAssistantResponding={chat.isAssistantResponding}
        isCancelling={chat.isCancelling}
        onStopAssistantResponse={chat.stopAssistantResponse}
        modelOptions={chat.modelOptions}
        selectedModel={chat.selectedModel}
        setSelectedModel={chat.setSelectedModel}
        selectableNodes={chat.selectableNodes}
        attachedNodes={chat.attachedNodes}
        attachedPosition={chat.attachedPosition}
        addAttachments={chat.addAttachments}
        removeAttachments={chat.removeAttachments}
        isRecording={chat.isRecording}
        isTranscribing={chat.isTranscribing}
        sttBusy={chat.sttBusy}
        micLevel={chat.micLevel}
        dirtyNodeIds={chat.dirtyNodeIds}
        hasDirtyWindows={chat.hasDirtyWindows}
      />
    </div>
  );
}

/** Écran d'accueil d'une conversation vierge, avant le premier message. */
function EmptyThreadState() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-slate-100 opacity-60">
        <NoleIcon size={20} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-slate-600">
          Start talking to Nolë
        </p>
        <p className="text-sm text-slate-400">
          Mention a node with <span className="font-medium">@</span> to give it
          context.
        </p>
      </div>
    </div>
  );
}
