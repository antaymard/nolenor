import { useUIMessages } from "@convex-dev/agent/react";
import { memo, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { cn } from "@/lib/utils";
import { useChatAutoScroll } from "@/hooks/useChatAutoScroll";
import { useThreadMessageMetadata } from "@/hooks/useThreadMessageMetadata";
import { useAssistantActivity } from "@/hooks/useAssistantActivity";
import { Message } from "./message/Message";
import ChatStatusOverlay from "./ChatStatusOverlay";

/**
 * Nombre de messages de fin laissés hors confinement.
 *
 * Le reste du fil porte `content-visibility: auto`, qui laisse le navigateur
 * sauter style, layout et paint de ce qui est hors écran — sans quoi le coût de
 * chaque frappe dans le composer (react-mentions force un layout par caractère)
 * et de chaque lecture de `scrollHeight` par l'auto-scroll grandit avec la
 * conversation, d'autant que shiki produit un `<span>` par token.
 *
 * Les derniers messages en sont exclus parce que ce sont ceux qu'on regarde :
 * au premier rendu le navigateur leur donnerait la taille de repli, et le
 * « scroll tout en bas » du montage atterrirait à côté une fois les vraies
 * hauteurs connues. Plus haut le risque disparaît : `contain-intrinsic-size:
 * auto` fait mémoriser au navigateur la hauteur réelle dès qu'un message a été
 * affiché une fois, et 200px n'est que le repli pour ceux qui ne l'ont jamais
 * été.
 */
const LIVE_MESSAGES_COUNT = 8;

type ChatInterfaceProps = {
  threadId: string;
  onRetry?: (userMessage: string) => void;
};

const ChatInterface = memo(function ChatInterface({
  threadId,
  onRetry,
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

  // Le flux ne sert plus qu'au détail affiché ici — orbe, échec, relance.
  // L'état grossier du tour, celui qui pilote le composer et se lit depuis les
  // autres surfaces, vient du serveur (cf. `useNoleChat`).
  const activity = useAssistantActivity(messages);
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
                onClick={() => loadMore(10)}
                className="mx-auto rounded-full border border-slate-200 px-3 py-1 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
              >
                Load more messages
              </button>
            )}
            {messages.map((m, index) => (
              <div
                key={m.key}
                className={cn(
                  index < messages.length - LIVE_MESSAGES_COUNT &&
                    "[content-visibility:auto] [contain-intrinsic-size:auto_200px]",
                )}
              >
                <Message
                  message={m}
                  metadata={getMetadata(m)}
                  modelOptions={modelOptions}
                />
              </div>
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
