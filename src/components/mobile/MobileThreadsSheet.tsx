import type { Id } from "@/../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";
import { Button } from "@/components/shadcn/button";
import { TbPlus, TbTrash } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { useCanvasThreads } from "@/components/canvas/nole-panel/useCanvasThreads";
import { useMobileNoleChat } from "./mobileNoleContextValue";

interface MobileThreadsSheetProps {
  canvasId: Id<"canvases">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** L'historique des conversations du canvas, ouvert depuis le header du chat. */
export default function MobileThreadsSheet({
  canvasId,
  open,
  onOpenChange,
}: MobileThreadsSheetProps) {
  const { threadId, selectThread, startNewThread } = useMobileNoleChat();
  const { threads, deleteThread } = useCanvasThreads(canvasId);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[85vw] sm:max-w-sm p-0">
        <SheetHeader className="border-b">
          <SheetTitle>Conversations</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <div className="mb-2 flex items-center justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                startNewThread();
              }}
            >
              <TbPlus size={16} />
              Nouvelle conversation
            </Button>
          </div>

          {!threads ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">
              Loading...
            </div>
          ) : threads.length === 0 ? (
            <div className="px-2 py-2 text-sm text-muted-foreground">
              Aucune conversation sur ce canvas
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {threads.map((thread) => (
                <ThreadRow
                  key={thread.threadId}
                  active={thread.threadId === threadId}
                  title={thread.title}
                  onSelect={() => {
                    selectThread(thread.threadId);
                    onOpenChange(false);
                  }}
                  onDelete={() => void deleteThread(thread.threadId)}
                />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ThreadRow({
  title,
  active,
  onSelect,
  onDelete,
}: {
  title: string | null;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "min-w-0 flex-1 truncate rounded-md px-2 py-3 text-left text-sm",
          active ? "bg-slate-200 font-medium" : "hover:bg-slate-100",
        )}
      >
        {title || "Untitled"}
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-9 w-9 opacity-50 hover:text-red-500 hover:opacity-100"
        onClick={onDelete}
        aria-label="Delete thread"
      >
        <TbTrash size={15} />
      </Button>
    </div>
  );
}
