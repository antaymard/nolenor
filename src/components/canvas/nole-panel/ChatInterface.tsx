import { useUIMessages } from "@convex-dev/agent/react";
import { Fragment, memo, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { cn } from "@/lib/utils";
import { useChatAutoScroll } from "@/hooks/useChatAutoScroll";
import { useThreadMessageMetadata } from "@/hooks/useThreadMessageMetadata";
import { useAssistantActivity } from "@/hooks/useAssistantActivity";
import { Message } from "./message/Message";
import { CompactionDivider } from "./message/CompactionDivider";
import { QueuedMessages } from "./message/QueuedMessages";
import ChatStatusOverlay from "./ChatStatusOverlay";

type ChatInterfaceProps = {
  threadId: string;
  onRetry?: (userMessage: string) => void;
  /**
   * Le tour est en cours selon le serveur (`runStatus`).
   * Seul signal fiable entre deux étapes : le message n'y est plus
   * `streaming` mais `pending`, alors que l'agent travaille toujours.
   */
  isRunActive?: boolean;
  /** Le tour attend une réponse de l'utilisateur (`ask_user`). */
  isAwaitingAnswer?: boolean;
};

const ChatInterface = memo(function ChatInterface({
  threadId,
  onRetry,
  isRunActive = false,
  isAwaitingAnswer = false,
}: ChatInterfaceProps) {
  const {
    results: messages,
    status,
    loadMore,
  } = useUIMessages(
    api.threads.listMessages,
    { threadId },
    { initialNumItems: 60, stream: true },
  );

  const modelOptions = useQuery(api.ia.nole.listChatModels, {});

  // Un séparateur avant le premier message gardé tel quel par chaque
  // compaction (cf. convex/harness/compaction.ts).
  const compactionPoints = useQuery(api.harness.live.listCompactionPoints, {
    threadId,
  });
  const dividerBefore = useMemo(() => {
    const keys = new Set<string>();
    for (const point of compactionPoints ?? []) {
      const first = messages.find(
        (m) =>
          m.order > point.order ||
          (m.order === point.order && m.stepOrder >= point.stepOrder),
      );
      if (first) keys.add(first.key);
    }
    return keys;
  }, [compactionPoints, messages]);
  const getMetadata = useThreadMessageMetadata(threadId);
  const { scrollViewportRef, handleScroll } = useChatAutoScroll(messages);

  // Le flux ne sert plus qu'au détail affiché ici — orbe, échec, relance.
  // L'état grossier du tour, celui qui pilote le composer et se lit depuis les
  // autres surfaces, vient du serveur (cf. `useNoleChat`).
  const activity = useAssistantActivity(
    messages,
    isRunActive,
    isAwaitingAnswer,
  );
  const { lastUserText } = activity;

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
                onClick={() => loadMore(30)}
                className="mx-auto rounded-full border border-slate-200 px-3 py-1 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                Load more messages
              </button>
            )}
            {messages.map((m, index) => (
              <Fragment key={m.key}>
                {dividerBefore.has(m.key) && <CompactionDivider />}
                <Message
                  message={m}
                  // Seul le dernier message peut être celui du tour en cours :
                  // les autres reçoivent un `false` stable et ne re-rendent pas.
                  isRunActive={isRunActive && index === messages.length - 1}
                  isAwaitingAnswer={
                    isAwaitingAnswer && index === messages.length - 1
                  }
                  threadId={threadId}
                  metadata={getMetadata(m)}
                  modelOptions={modelOptions}
                />
              </Fragment>
            ))}
            <QueuedMessages threadId={threadId} />
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
