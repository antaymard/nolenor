import { useCallback } from "react";
import { TbLoader, TbPlus, TbX } from "react-icons/tb";
import toast from "react-hot-toast";
import { Button } from "@/components/shadcn/button";
import { useNoleChat } from "@/hooks/useNoleChat";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import ChatInput from "./ChatInput";
import ChatInterface from "./ChatInterface";
import ThreadSelector from "./ThreadSelector";
import ThreadStatsBadge from "./ThreadStatsBadge";

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
      <div className="w-full h-full flex items-center justify-center text-slate-500">
        <TbLoader className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col shadow-2xl/10">
      {/* Header */}
      <div className="pl-2 rounded-t-lg border-b flex items-center justify-between gap-2">
        <p className="text-sm font-medium truncate flex-1">
          {threadId ? threadInfo?.title || "Untitled chat" : "New chat"}
        </p>
        <ThreadStatsBadge
          threadId={threadId}
          selectedModel={chat.selectedModel}
          modelOptions={chat.modelOptions}
        />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={chat.startNewThread}
          >
            <TbPlus size={14} />
          </Button>
          <ThreadSelector
            canvasId={chat.canvasId}
            currentThreadId={threadId}
            onSelectThread={chat.selectThread}
          />
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

      {/* Messages — pas de thread tant que le premier message n'est pas parti */}
      <div className="w-full flex-1 min-h-0">
        {threadId ? (
          <ChatInterface
            threadId={threadId}
            onRetry={handleRetry}
            onAssistantRespondingChange={chat.setIsAssistantResponding}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center px-4 text-center text-sm text-slate-400">
            Start talking to Nolë
          </div>
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
