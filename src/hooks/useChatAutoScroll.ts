import { useCallback, useEffect, useRef, useState } from "react";

const AUTO_SCROLL_BOTTOM_THRESHOLD_PX = 80;

/**
 * Keeps a scrollable message list pinned to the bottom as content streams in,
 * while respecting the user scrolling up to read history.
 *
 * Auto-scrolls are coalesced with `requestAnimationFrame` so streaming-driven
 * re-renders don't force a synchronous layout per token.
 *
 * @param messages the message list — a new message or a change to the last
 *   message (e.g. a streaming update) triggers the auto-scroll.
 */
export function useChatAutoScroll(messages: readonly unknown[]) {
  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const lastScrollTop = useRef(0);
  const stickToBottom = useRef(false);
  const rafId = useRef<number | null>(null);
  const prevLength = useRef(0);
  const prevLastMessage = useRef<unknown>(null);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const div = scrollViewportRef.current;
    if (!div) return;
    stickToBottom.current = true;
    div.scrollTo({ top: div.scrollHeight, behavior });
  }, []);

  const checkIsAtBottom = useCallback(() => {
    const div = scrollViewportRef.current;
    if (!div) return true;
    const distanceFromBottom = div.scrollHeight - div.scrollTop - div.clientHeight;
    return (
      distanceFromBottom <= AUTO_SCROLL_BOTTOM_THRESHOLD_PX ||
      div.scrollHeight <= div.clientHeight
    );
  }, []);

  const handleScroll = useCallback(() => {
    const div = scrollViewportRef.current;
    if (!div) return;

    const newIsAtBottom = checkIsAtBottom();
    const isScrollingUp = div.scrollTop < lastScrollTop.current;

    if (!newIsAtBottom && isScrollingUp) {
      stickToBottom.current = false;
    }

    // Ignore downward scroll that hasn't reached the bottom yet.
    const isScrollingDownButNotAtBottom =
      !newIsAtBottom && lastScrollTop.current < div.scrollTop;
    if (!isScrollingDownButNotAtBottom) {
      if (newIsAtBottom) stickToBottom.current = false;
      setIsAtBottom(newIsAtBottom);
    }

    lastScrollTop.current = div.scrollTop;
  }, [checkIsAtBottom]);

  // Auto-scroll when the content changes (new message or streaming update).
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    const hasNewMessage = messages.length !== prevLength.current;
    const lastMessageChanged = lastMessage !== prevLastMessage.current;
    prevLength.current = messages.length;
    prevLastMessage.current = lastMessage;
    if (!hasNewMessage && !lastMessageChanged) return;

    if (rafId.current != null) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      rafId.current = null;
      if (stickToBottom.current) {
        scrollToBottom("auto");
      } else if (isAtBottom) {
        scrollToBottom("instant");
      }
    });
    return () => {
      if (rafId.current != null) {
        cancelAnimationFrame(rafId.current);
        rafId.current = null;
      }
    };
  }, [messages, isAtBottom, scrollToBottom]);

  // Instant scroll on first mount.
  useEffect(() => {
    scrollToBottom("instant");
  }, [scrollToBottom]);

  return { scrollViewportRef, handleScroll };
}
