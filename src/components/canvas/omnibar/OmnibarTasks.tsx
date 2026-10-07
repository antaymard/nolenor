import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { useOpenNoleThread } from "@/hooks/useOpenNoleThread";
import { isPendingReview, type PendingTask } from "@/lib/threadRunStatus";
import TaskCard from "@/components/canvas/on-canvas-ui/TaskCard";

/** Au-delà, le reste passe derrière un « +N ». */
const MAX_VISIBLE = 3;

/**
 * Les tâches de Nolë sous l'omnibar : ce qui tourne, ce qui attend une
 * réponse, et ce qui est fini sans avoir été relu. C'est une boîte de
 * réception, pas un flux : une tâche y reste jusqu'à ce qu'on l'ait vue.
 *
 * Une tâche est un run, pas un thread (cf. convex/runs.ts) : deux demandes
 * aiguillées vers le même sujet font deux cartes tant qu'elles ne sont pas
 * relues.
 */
export default function OmnibarTasks({ canvasId }: { canvasId: Id<"canvases"> }) {
  const open = useOpenNoleThread();
  const markRunReviewed = useMutation(api.runs.markRunReviewed);
  const markReviewed = (task: PendingTask) => {
    void markRunReviewed({ runId: task.runId }).catch(() => {});
  };
  const [overflowOpen, setOverflowOpen] = useState(false);
  const tasks = useQuery(api.runs.listPendingRuns, { canvasId });

  // Le serveur filtre grossièrement (il ne lit pas l'horloge) ; la décision
  // finale se prend ici, à l'heure du rendu.
  const pending = (tasks ?? []).filter((task) =>
    isPendingReview(task, Date.now()),
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
      {visible.map((task) => (
        <TaskCard
          key={task.runId}
          task={task}
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
              {overflow.map((task) => (
                <TaskCard
                  key={task.runId}
                  task={task}
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
