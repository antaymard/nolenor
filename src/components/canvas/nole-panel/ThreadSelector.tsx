import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { TbMessageSearch, TbTrash } from "react-icons/tb";
import { useCanvasThreads } from "./useCanvasThreads";
import { ThreadRunStatusPill } from "./ThreadStatusPill";

interface ThreadSelectorProps {
  canvasId: Id<"canvases"> | undefined;
  currentThreadId: string | null;
  onSelectThread: (threadId: string) => void;
}

export default function ThreadSelector({
  canvasId,
  currentThreadId,
  onSelectThread,
}: ThreadSelectorProps) {
  const { threads, deleteThread } = useCanvasThreads(canvasId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="text-slate-400">
          <TbMessageSearch size={16} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-64 max-h-80 overflow-y-auto"
      >
        {(!threads || threads.length === 0) && (
          <div className="p-3 text-sm text-muted-foreground text-center">
            Aucune conversation sur ce canvas
          </div>
        )}
        {threads?.map((thread) => (
          <DropdownMenuItem
            key={thread.threadId}
            className="flex items-center justify-between gap-2 cursor-pointer"
            onSelect={() => onSelectThread(thread.threadId)}
          >
            <div className="flex flex-col flex-1 min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">
                  {thread.title || "Sans titre"}
                </span>
                {/* Compact : dans une liste, la couleur suffit à repérer le
                    thread qui travaille — le libellé reste au survol. */}
                <ThreadRunStatusPill thread={thread} size="compact" />
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(thread.lastActivityTime).toLocaleDateString()}
              </span>
            </div>
            {thread.threadId !== currentThreadId && (
              <button
                type="button"
                className="p-1 rounded hover:text-red-500 shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  void deleteThread(thread.threadId);
                }}
              >
                <TbTrash size={14} />
              </button>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
