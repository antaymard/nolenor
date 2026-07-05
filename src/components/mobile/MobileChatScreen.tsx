import { useCallback } from "react";
import { Button } from "@/components/shadcn/button";
import {
  TbChevronDown,
  TbLoader,
  TbMenu2,
  TbPlus,
  TbSearch,
} from "react-icons/tb";
import { useMobileNoleChat } from "./mobileNoleContextValue";
import ChatInterface from "@/components/canvas/nole-panel/ChatInterface";

interface MobileChatScreenProps {
  canvasName?: string;
  onOpenLeft: () => void;
  onOpenSearch: () => void;
}

export default function MobileChatScreen({
  canvasName,
  onOpenLeft,
  onOpenSearch,
}: MobileChatScreenProps) {
  const { threadId, isLoading, setUserInput, setIsAssistantResponding, startNewThread } =
    useMobileNoleChat();

  const handleRetry = useCallback(
    (userMessage: string) => setUserInput(userMessage),
    [setUserInput],
  );

  if (isLoading) {
    return (
      <div className="h-dvh flex items-center justify-center text-muted-foreground">
        <TbLoader className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!threadId) {
    return (
      <div className="h-dvh flex items-center justify-center text-muted-foreground">
        Error loading chat
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b px-2 py-2 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenLeft}
          aria-label="Open menu"
        >
          <TbMenu2 size={20} />
        </Button>
        <button
          type="button"
          className="flex items-center gap-1 truncate text-sm font-medium px-2 py-1 rounded hover:bg-accent/60"
          onClick={onOpenLeft}
        >
          <span className="truncate max-w-[55vw]">
            {canvasName ?? "Workspace"}
          </span>
          <TbChevronDown size={14} className="shrink-0 opacity-70" />
        </button>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void startNewThread()}
            aria-label="New conversation"
          >
            <TbPlus size={20} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenSearch}
            aria-label="Open search"
          >
            <TbSearch size={20} />
          </Button>
        </div>
      </div>

      {/* Chat — leave room for the fixed input below */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0">
          <ChatInterface
            threadId={threadId}
            onRetry={handleRetry}
            onAssistantRespondingChange={setIsAssistantResponding}
          />
        </div>
        {/* Spacer to avoid content going under the fixed input */}
        <div
          className="shrink-0"
          style={{ height: "var(--mobile-chat-input-h, 0px)" }}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
