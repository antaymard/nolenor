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
import { ThreadRunStatusPill } from "@/components/canvas/nole-panel/ThreadStatusPill";
import type { ThreadRunFields } from "@/lib/threadRunStatus";
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
  // Comme sur desktop : la liste ne se charge qu'à l'ouverture. Sa query
  // hydrate 30 threads via le composant agent et lit `threadMetadata`, donc
  // montée en permanence elle se réinvalidait à chaque step du tour en cours.
  const { threads, deleteThread } = useCanvasThreads(
    open ? canvasId : undefined,
  );

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
                  run={thread}
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
  run,
  onSelect,
  onDelete,
}: {
  title: string | null;
  active: boolean;
  run: ThreadRunFields;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-3 text-left text-sm",
          active ? "bg-slate-200 font-medium" : "hover:bg-slate-100",
        )}
      >
        <span className="min-w-0 flex-1 truncate">{title || "Untitled"}</span>
        <ThreadRunStatusPill thread={run} size="compact" />
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
