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
  onAssistantRespondingChange?: (responding: boolean) => void;
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
  const getMetadata = useThreadMessageMetadata(threadId, messages);
  const { scrollViewportRef, handleScroll } = useChatAutoScroll(messages);

  const activity = useAssistantActivity(messages);
  const { showThinking, lastUserText } = activity;

  // Lift the "is the assistant responding" signal up to the container so it can
  // drive the composer without subscribing to the stream a second time.
  useEffect(() => {
    onAssistantRespondingChange?.(showThinking);
  }, [showThinking, onAssistantRespondingChange]);

  const handleRetry = useCallback(() => {
    if (lastUserText) onRetry?.(lastUserText);
  }, [lastUserText, onRetry]);

  const reserveOverlaySpace = activity.showThinking || activity.isFailed;

  return (
    <div className="h-full flex flex-col w-full relative">
      <div
        ref={scrollViewportRef}
        className="flex-1 overflow-y-auto p-3"
        onScroll={handleScroll}
      >
        {messages.length > 0 ? (
          <div className={cn("flex flex-col gap-8", reserveOverlaySpace && "pb-12")}>
            {status === "CanLoadMore" && (
              <button
                onClick={() => loadMore(10)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition font-medium mx-auto"
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
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
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
