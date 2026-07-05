import { useUIMessages, type UIMessage } from "@convex-dev/agent/react";
import { api } from "@convex/_generated/api";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { RiLoaderLine } from "react-icons/ri";
import { TbAlertCircle, TbCheck } from "react-icons/tb";
import { cn } from "./utils";

const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 80;

export const ChatInterface = memo(function ChatInterface({
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
  const lastUserText = lastUserMessage?.text ?? undefined;

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

  const getDistanceFromBottom = useCallback(() => {
    const div = scrollViewportRef.current;
    if (!div) return 0;
    return div.scrollHeight - div.scrollTop - div.clientHeight;
  }, []);

  const checkIsAtBottom = useCallback(() => {
    const div = scrollViewportRef.current;
    if (!div) return true;
    return (
      getDistanceFromBottom() <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX ||
      div.scrollHeight <= div.clientHeight
    );
  }, [getDistanceFromBottom]);

  const handleScroll = useCallback(() => {
    const div = scrollViewportRef.current;
    if (!div) return;
    const newIsAtBottom = checkIsAtBottom();
    const isScrollingUp = div.scrollTop < lastScrollTop.current;

    if (!newIsAtBottom && isScrollingUp) {
      scrollingToBottomRef.current = false;
    }

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

  const scrollRafRef = useRef<number | null>(null);
  useEffect(() => {
    if (!scrollViewportRef.current) return;

    const currentLength = messages.length;
    const current = messages[messages.length - 1];
    const hasNewMessage = currentLength !== previousMessagesLengthRef.current;
    const lastMessageChanged = current !== previousLastMessageRef.current;

    previousMessagesLengthRef.current = currentLength;
    previousLastMessageRef.current = current;

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

  useEffect(() => {
    scrollToBottom("instant");
  }, [scrollToBottom]);

  return (
    <div className="h-full flex flex-col w-full relative">
      <div
        ref={scrollViewportRef}
        className="flex-1 overflow-y-auto p-3"
        onScroll={handleScroll}
      >
        {messages.length > 0 ? (
          <div
            className={cn(
              "flex flex-col gap-4",
              (showThinkingIndicator || isLastMessageFailed) && "pb-12",
            )}
          >
            {status === "CanLoadMore" && (
              <button
                onClick={() => loadMore(10)}
                className="px-3 py-1.5 rounded-lg bg-muted text-muted-foreground text-sm hover:bg-accent transition mx-auto"
              >
                Load more
              </button>
            )}
            {messages.map((m) => (
              <ChatMessage key={m.key} message={m} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground text-sm">
            Start a conversation...
          </div>
        )}
      </div>

      {(showThinkingIndicator || showDone || isLastMessageFailed) && (
        <div className="absolute left-0 right-0 bottom-0 flex justify-center z-20 pb-2">
          {showThinkingIndicator && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground px-2 py-1">
              <RiLoaderLine size={14} className="animate-spin" />
              <span>
                {isAssistantThinking ? "Nole is thinking..." : "Waiting..."}
              </span>
            </div>
          )}
          {showDone && !showThinkingIndicator && (
            <div className="flex items-center gap-1.5 text-sm text-emerald-600 px-2 py-1">
              <TbCheck size={14} />
              <span>Done</span>
            </div>
          )}
          {isLastMessageFailed && !showThinkingIndicator && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1 mx-3">
              <TbAlertCircle size={14} className="shrink-0" />
              <span className="flex-1">Response failed.</span>
              {lastUserText && onRetry && (
                <button
                  type="button"
                  onClick={() => onRetry(lastUserText)}
                  className="underline text-red-700 hover:text-red-900 font-medium"
                >
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

function ChatMessage({ message }: { message: UIMessage }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-brand text-white rounded-2xl rounded-br-md px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.role === "assistant") {
    const parts = message.parts ?? [];

    if (parts.length === 0) {
      return (
        <div className="flex justify-start">
          <div className="max-w-[85%] bg-muted text-foreground rounded-2xl rounded-bl-md px-3 py-2 text-sm leading-relaxed break-words">
            {message.text || ""}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col gap-1.5">
        {parts.map((part: Record<string, unknown>, idx: number) => {
          const partType = part.type as string;

          if (partType === "text") {
            const text = (part.text as string) || "";
            if (!text.trim()) return null;
            return (
              <div key={idx} className="flex justify-start">
                <div className="max-w-[85%] bg-muted text-foreground rounded-2xl rounded-bl-md px-3 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap">
                  {text}
                </div>
              </div>
            );
          }

          if (partType === "reasoning") {
            return (
              <details key={idx} className="text-sm text-muted-foreground ml-1">
                <summary className="cursor-pointer">
                  Nole is thinking...
                </summary>
                <div className="mt-1 pl-2 border-l-2 text-muted-foreground whitespace-pre-wrap">
                  {(part.text as string) || ""}
                </div>
              </details>
            );
          }

          if (partType?.startsWith("tool-")) {
            const toolName = partType.replace("tool-", "");
            return (
              <details key={idx} className="text-sm text-muted-foreground ml-1">
                <summary className="cursor-pointer inline-flex items-center gap-1">
                  <span className="text-muted-foreground">Used tool: {toolName}</span>
                  {(part.state as string) === "running" && (
                    <RiLoaderLine size={12} className="animate-spin" />
                  )}
                  {(part.state as string) === "done" && (
                    <TbCheck size={12} className="text-emerald-500" />
                  )}
                  {(part.state as string) === "error" && (
                    <TbAlertCircle size={12} className="text-red-500" />
                  )}
                </summary>
                <div className="mt-1 pl-2 border-l-2">
                  {part.args && (
                    <div className="text-muted-foreground text-xs mb-1">
                      Input:{" "}
                      {JSON.stringify(part.args, null, 0).substring(0, 200)}
                    </div>
                  )}
                  {part.result && (
                    <div className="text-muted-foreground text-xs whitespace-pre-wrap">
                      {typeof part.result === "string"
                        ? part.result.substring(0, 500)
                        : JSON.stringify(part.result).substring(0, 500)}
                    </div>
                  )}
                </div>
              </details>
            );
          }

          return null;
        })}
      </div>
    );
  }

  return null;
}

export default ChatInterface;
