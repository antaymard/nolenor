import { useUIMessages } from "@convex-dev/agent/react";
import { memo, useCallback, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { cn } from "@/lib/utils";
import { useChatAutoScroll } from "@/hooks/useChatAutoScroll";
import { useThreadMessageMetadata } from "@/hooks/useThreadMessageMetadata";
import { useAssistantActivity } from "@/hooks/useAssistantActivity";
import { Message } from "./message/Message";
import ChatStatusOverlay from "./ChatStatusOverlay";

type ChatInterfaceProps = {
  threadId: string;
  onRetry?: (userMessage: string) => void;
  /** Le threadId est renvoyé avec l'état : le conteneur doit pouvoir ignorer
   *  un signal qui ne concerne plus la conversation affichée. */
  onAssistantRespondingChange?: (responding: boolean, threadId: string) => void;
};

const ChatInterface = memo(function ChatInterface({
  threadId,
  onRetry,
  onAssistantRespondingChange,
}: ChatInterfaceProps) {
  const {
    results: messages,
    status,
    loadMore,
  } = useUIMessages(
    api.threads.listMessages,
    { threadId },
    { initialNumItems: 20, stream: true },
  );

  const modelOptions = useQuery(api.ia.nole.listChatModels, {});
  const getMetadata = useThreadMessageMetadata(threadId);
  const { scrollViewportRef, handleScroll } = useChatAutoScroll(messages);

  const activity = useAssistantActivity(messages);
  const { showThinking, lastUserText } = activity;

  // Lift the "is the assistant responding" signal up to the container so it can
  // drive the composer without subscribing to the stream a second time.
  useEffect(() => {
    onAssistantRespondingChange?.(showThinking, threadId);
  }, [showThinking, threadId, onAssistantRespondingChange]);

  const handleRetry = useCallback(() => {
    if (lastUserText) onRetry?.(lastUserText);
  }, [lastUserText, onRetry]);

  const reserveOverlaySpace = activity.showThinking || activity.isFailed;

  return (
    <div className="h-full flex flex-col w-full relative">
      <div
        ref={scrollViewportRef}
        className="flex-1 overflow-y-auto px-3 py-4"
        onScroll={handleScroll}
      >
        {messages.length > 0 ? (
          <div className={cn("flex flex-col gap-6", reserveOverlaySpace && "pb-12")}>
            {status === "CanLoadMore" && (
              <button
                onClick={() => loadMore(10)}
                className="mx-auto rounded-full border border-slate-200 px-3 py-1 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                Load more messages
              </button>
            )}
            {messages.map((m) => (
              <Message
                key={m.key}
                message={m}
                metadata={getMetadata(m)}
                modelOptions={modelOptions}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-sm text-slate-400">
            Start a conversation...
          </div>
        )}
      </div>

      <ChatStatusOverlay
        showThinking={activity.showThinking}
        isThinking={activity.isThinking}
        showDone={activity.showDone}
        isFailed={activity.isFailed}
        onRetry={onRetry && lastUserText ? handleRetry : undefined}
      />
    </div>
  );
});

export default ChatInterface;
