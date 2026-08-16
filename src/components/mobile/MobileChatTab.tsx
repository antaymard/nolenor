import { useCallback, useState } from "react";
import { TbHistory, TbLoader, TbPlus } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import ChatInterface from "@/components/canvas/nole-panel/ChatInterface";
import { useMobileNoleChat } from "./mobileNoleContextValue";
import MobileChatInput from "./MobileChatInput";
import MobileThreadsSheet from "./MobileThreadsSheet";

export default function MobileChatTab({
  canvasId,
}: {
  canvasId: Id<"canvases">;
}) {
  const {
    threadId,
    threadInfo,
    isLoading,
    setUserInput,
    setIsAssistantResponding,
    startNewThread,
  } = useMobileNoleChat();
  const [threadsOpen, setThreadsOpen] = useState(false);

  const handleRetry = useCallback(
    (userMessage: string) => setUserInput(userMessage),
    [setUserInput],
  );

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-slate-500">
        <TbLoader className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Header de conversation : le switcher de canvas vit en top bar, ici on
          ne parle que de threads. */}
      <div className="flex shrink-0 items-center gap-2 border-b px-2 py-1.5">
        <span className="min-w-0 flex-1 truncate text-sm text-slate-500">
          {threadInfo?.title || "Nouvelle conversation"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={startNewThread}
          aria-label="Nouvelle conversation"
        >
          <TbPlus size={20} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setThreadsOpen(true)}
          aria-label="Historique des conversations"
        >
          <TbHistory size={20} />
        </Button>
      </div>

      <div className="min-h-0 flex-1">
        {/* Pas de thread tant que le premier message n'est pas parti. */}
        {threadId ? (
          <ChatInterface
            // Remonter à chaque conversation : l'état interne (scroll, flash
            // « Done », activité) ne doit pas déborder d'un thread sur l'autre.
            key={threadId}
            threadId={threadId}
            onRetry={handleRetry}
            onAssistantRespondingChange={setIsAssistantResponding}
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-400">
            Start talking to Nolë
          </div>
        )}
      </div>

      <MobileChatInput />

      <MobileThreadsSheet
        canvasId={canvasId}
        open={threadsOpen}
        onOpenChange={setThreadsOpen}
      />
    </div>
  );
}
