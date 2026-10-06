import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import {
  useMarkThreadReviewed,
  useOpenNoleThread,
} from "@/hooks/useOpenNoleThread";
import { isPendingReview } from "@/lib/threadRunStatus";
import TaskCard from "@/components/canvas/on-canvas-ui/TaskCard";

/** Au-delà, le reste passe derrière un « +N ». */
const MAX_VISIBLE = 3;

/**
 * Les tâches de Nolë sous l'omnibar : ce qui tourne, ce qui attend une
 * réponse, et ce qui est fini sans avoir été relu. C'est une boîte de
 * réception, pas un flux : une tâche y reste jusqu'à ce qu'on l'ait vue.
 */
export default function OmnibarTasks({ canvasId }: { canvasId: Id<"canvases"> }) {
  const open = useOpenNoleThread();
  const markReviewed = useMarkThreadReviewed();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const threads = useQuery(api.threads.listPendingThreads, { canvasId });

  // Le serveur filtre grossièrement (il ne lit pas l'horloge) ; la décision
  // finale se prend ici, à l'heure du rendu.
  const pending = (threads ?? []).filter((thread) =>
    isPendingReview(thread, Date.now()),
  );
  if (pending.length === 0) return null;

  const visible = pending.slice(0, MAX_VISIBLE);
  const overflow = pending.slice(MAX_VISIBLE);
  const openThread = (threadId: string) => {
    open(threadId);
    setOverflowOpen(false);
  };

  return (
    <div className="flex flex-wrap items-start justify-center gap-2">
      {visible.map((thread) => (
        <TaskCard
          key={thread.threadId}
          thread={thread}
          onOpen={openThread}
          onReview={markReviewed}
        />
      ))}
      {overflow.length > 0 && (
        <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`${overflow.length} more tasks`}
              className="flex h-[46px] shrink-0 items-center rounded-xl border border-slate-200 bg-surface px-3 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
            >
              +{overflow.length}
            </button>
          </PopoverTrigger>
          <PopoverContent side="bottom" align="center" className="w-auto p-2">
            <div className="flex flex-col items-start gap-2">
              {overflow.map((thread) => (
                <TaskCard
                  key={thread.threadId}
                  thread={thread}
                  onOpen={openThread}
                  onReview={markReviewed}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
