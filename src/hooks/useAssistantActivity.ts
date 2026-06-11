import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "@convex-dev/agent/react";
import { extractUserMessageForDisplay } from "@/components/canvas/nole-panel/chatHelpers";

/** How long the "Done" flash stays visible after a response completes. */
const DONE_FLASH_MS = 2000;

export type AssistantActivity = {
  /** The assistant is currently streaming a response. */
  isThinking: boolean;
  /** Whether to show the thinking/waiting indicator (streaming or queued). */
  showThinking: boolean;
  /** The last assistant message failed. */
  isFailed: boolean;
  /** Brief success flash shown right after a response completes. */
  showDone: boolean;
  /** Text of the most recent user message (for the retry action). */
  lastUserText: string | undefined;
};

/** Derives the assistant's activity state from the streamed message list. */
export function useAssistantActivity(
  messages: readonly UIMessage[],
): AssistantActivity {
  const lastMessage = messages[messages.length - 1];
  const isThinking =
    !!lastMessage &&
    lastMessage.role === "assistant" &&
    lastMessage.status === "streaming";
  const isWaiting = !!lastMessage && lastMessage.role === "user" && !isThinking;
  const isFailed =
    !!lastMessage &&
    lastMessage.role === "assistant" &&
    lastMessage.status === "failed";

  const showDone = useDoneFlash(isThinking, lastMessage?.status);

  return {
    isThinking,
    showThinking: isThinking || isWaiting,
    isFailed,
    showDone,
    lastUserText: findLastUserText(messages),
  };
}

function findLastUserText(messages: readonly UIMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      return extractUserMessageForDisplay(messages[i].text ?? "");
    }
  }
  return undefined;
}

/** Shows a transient "Done" flash when the assistant transitions out of
 * thinking with a successful final status. */
function useDoneFlash(isThinking: boolean, lastStatus: string | undefined) {
  const wasThinking = useRef(false);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    if (wasThinking.current && !isThinking && lastStatus === "success") {
      setShowDone(true);
      const timer = setTimeout(() => setShowDone(false), DONE_FLASH_MS);
      return () => clearTimeout(timer);
    }
    wasThinking.current = isThinking;
  }, [isThinking, lastStatus]);

  return showDone;
}
