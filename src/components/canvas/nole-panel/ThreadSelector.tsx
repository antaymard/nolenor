import { useQuery, useAction } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { TbMessageSearch, TbTrash } from "react-icons/tb";
import { toastError } from "@/components/utils/errorUtils";

interface ThreadSelectorProps {
  currentThreadId: string;
  onSelectThread: (threadId: string) => void;
}

export default function ThreadSelector({
  currentThreadId,
  onSelectThread,
}: ThreadSelectorProps) {
  const userThreads = useQuery(api.threads.listUserThreads, {
    paginationOpts: { numItems: 20, cursor: null },
  });
  const deleteThread = useAction(api.threads.deleteThread);

  const threadsData = userThreads?.success ? userThreads.threads : null;
  const threads =
    threadsData && !Array.isArray(threadsData) ? threadsData.page : [];

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
        {threads.length === 0 && (
          <div className="p-3 text-sm text-muted-foreground text-center">
            No previous sessions
          </div>
        )}
        {threads.map((thread) => (
          <DropdownMenuItem
            key={thread._id}
            className="flex items-center justify-between gap-2 cursor-pointer"
            onSelect={() => onSelectThread(thread._id)}
          >
            <div className="flex flex-col flex-1 min-w-0">
              <span className="truncate text-sm font-medium">
                {thread.title || "Untitled"}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(thread._creationTime).toLocaleDateString()}
              </span>
            </div>
            {thread._id !== currentThreadId && (
              <button
                type="button"
                className="p-1 rounded hover:text-red-500 shrink-0"
                onClick={async (e) => {
                  e.stopPropagation();
                  try {
                    await deleteThread({ threadId: thread._id });
                  } catch (error) {
                    toastError(error, "Error deleting thread.");
                  }
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
