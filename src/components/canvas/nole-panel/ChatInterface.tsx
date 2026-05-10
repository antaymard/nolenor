import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import { api } from "@/../convex/_generated/api";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { RiLoaderLine } from "react-icons/ri";
import { TbAlertCircle, TbCheck } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { extractUserMessageForDisplay, Message } from "./Message";

const ChatInterface = memo(function ChatInterface({
  threadId,
  onRetry,
  onAssistantRespondingChange,
}: {
  threadId: string;
  onRetry?: (userMessage: string) => void;
  onAssistantRespondingChange?: (responding: boolean) => void;
}) {
  const {
    results: messages,
    status,
    loadMore,
  } = useUIMessages(
    api.threads.listMessages,
    { threadId },
    { initialNumItems: 20, stream: true },
  );

  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const lastScrollTop = useRef<number>(0);
  const scrollingToBottomRef = useRef(false);
  const previousMessagesLengthRef = useRef(0);
  const previousLastMessageRef = useRef<UIMessage | null>(null);
  const lastMessage = messages[messages.length - 1];
  const isAssistantThinking =
    !!lastMessage &&
    lastMessage.role === "assistant" &&
    lastMessage.status === "streaming";
  const isWaitingForAssistant =
    !!lastMessage && lastMessage.role === "user" && !isAssistantThinking;
  const showThinkingIndicator = isAssistantThinking || isWaitingForAssistant;
  useEffect(() => {
    onAssistantRespondingChange?.(showThinkingIndicator);
  }, [showThinkingIndicator, onAssistantRespondingChange]);
  const isLastMessageFailed =
    !!lastMessage &&
    lastMessage.role === "assistant" &&
    lastMessage.status === "failed";

  const lastUserMessage = messages.findLast((m) => m.role === "user");
  const lastUserText = lastUserMessage
    ? extractUserMessageForDisplay(lastUserMessage.text ?? "")
    : undefined;

  const prevThinkingRef = useRef(false);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (prevThinkingRef.current && !isAssistantThinking) {
      if (lastMessage?.status === "done") {
        setShowDone(true);
        const t = setTimeout(() => setShowDone(false), 2000);
        return () => clearTimeout(t);
      }
    }
    prevThinkingRef.current = isAssistantThinking;
  }, [isAssistantThinking, lastMessage?.status]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const div = scrollViewportRef.current;
    if (!div) return;
    scrollingToBottomRef.current = true;
    div.scrollTo({ top: div.scrollHeight, behavior });
  }, []);

  const checkIsAtBottom = useCallback(() => {
    const div = scrollViewportRef.current;
    if (!div) return true;
    return (
      Math.abs(div.scrollHeight - div.scrollTop - div.clientHeight) < 1 ||
      div.scrollHeight <= div.clientHeight
    );
  }, []);

  const handleScroll = useCallback(() => {
    const div = scrollViewportRef.current;
    if (!div) return;

    const newIsAtBottom = checkIsAtBottom();

    // Ne pas mettre a jour isAtBottom si on scrolle vers le bas
    if (!newIsAtBottom && lastScrollTop.current < div.scrollTop) {
      // ignore scroll down
    } else {
      if (newIsAtBottom) {
        scrollingToBottomRef.current = false;
      }
      setIsAtBottom(newIsAtBottom);
    }

    lastScrollTop.current = div.scrollTop;
  }, [checkIsAtBottom]);

  // Auto-scroll quand les messages changent ou que le contenu change.
  // RAF-coalesced so streaming-driven re-renders don't trigger a synchronous
  // scrollTo per token (which would force layout on every token).
  const scrollRafRef = useRef<number | null>(null);
  useEffect(() => {
    const div = scrollViewportRef.current;
    if (!div) return;

    const currentLength = messages.length;
    const lastMessage = messages[messages.length - 1];
    const hasNewMessage = currentLength !== previousMessagesLengthRef.current;
    const lastMessageChanged = lastMessage !== previousLastMessageRef.current;

    previousMessagesLengthRef.current = currentLength;
    previousLastMessageRef.current = lastMessage;

    if (!hasNewMessage && !lastMessageChanged) return;

    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      if (scrollingToBottomRef.current) {
        scrollToBottom("auto");
      } else if (isAtBottom) {
        scrollToBottom("instant");
      }
    });

    return () => {
      if (scrollRafRef.current != null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [messages, isAtBottom, scrollToBottom]);

  // Scroll instantane lors du premier chargement
  useEffect(() => {
    scrollToBottom("instant");
  }, [scrollToBottom]);

  return (
    <div className="h-full flex flex-col w-full relative">
      {/* Messages area - scrollable */}
      <div
        ref={scrollViewportRef}
        className="flex-1 overflow-y-auto p-3"
        onScroll={handleScroll}
      >
        {messages.length > 0 ? (
          <div
            className={cn(
              "flex flex-col gap-8",
              (showThinkingIndicator || isLastMessageFailed) && "pb-12",
            )}
          >
            {status === "CanLoadMore" && (
              <button
                onClick={() => loadMore(10)}
                className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition font-medium mx-auto"
              >
                Load more messages
              </button>
            )}
            {messages.map((m) => (
              <Message key={m.key} message={m} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            Start a conversation...
          </div>
        )}
      </div>
      {/* Overlay bottom: thinking / done / failed */}
      {(showThinkingIndicator || showDone || isLastMessageFailed) && (
        <div className="absolute left-0 right-0 bottom-0 flex justify-center z-20 pb-2">
          {showThinkingIndicator && (
            <div className="pointer-events-none">
              <ThinkingIndicator
                label={
                  isAssistantThinking
                    ? "Nole is thinking..."
                    : "Waiting for response..."
                }
              />
            </div>
          )}
          {showDone && !showThinkingIndicator && (
            <div className="pointer-events-none">
              <DoneIndicator />
            </div>
          )}
          {isLastMessageFailed && !showThinkingIndicator && (
            <FailedIndicator
              onRetry={
                lastUserText && onRetry
                  ? () => onRetry(lastUserText)
                  : undefined
              }
            />
          )}
        </div>
      )}
    </div>
  );
});

function ThinkingIndicator({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-slate-500 px-2 py-1">
      <RiLoaderLine size={14} className="animate-spin" />
      <span>{label}</span>
    </div>
  );
}

function DoneIndicator() {
  return (
    <div className="flex items-center gap-2 text-xs text-green-600 px-2 py-1">
      <TbCheck size={14} />
      <span>Done</span>
    </div>
  );
}

function FailedIndicator({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 mx-3">
      <TbAlertCircle size={14} className="shrink-0" />
      <span className="flex-1">La réponse a échoué.</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="underline text-red-700 hover:text-red-900 font-medium"
        >
          Réessayer
        </button>
      )}
    </div>
  );
}

export default ChatInterface;
