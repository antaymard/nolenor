import { useCallback, useState } from "react";
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
import TaskCard from "@/components/canvas/tasks/TaskCard";
import { resolveTaskView } from "@/components/canvas/tasks/taskView";

/** Cartes compactes visibles avant le « +N ». */
const MAX_COMPACT_VISIBLE = 3;

/**
 * Les tâches de Nolë au-dessus de l'omnibar : une carte par run (cf. convex/runs.ts).
 *
 * Ce qui demande une lecture ou une action (réponse, question, échec) passe
 * en tête, en pleine largeur ; le reste — en cours, ou fini avec un résultat
 * sur le canvas — en pile de cartes compactes dessous. Une boîte de
 * réception, pas un flux : une tâche y reste jusqu'à ce qu'on l'écarte ou
 * qu'on ouvre sa conversation.
 */
export default function OmnibarTasks({ canvasId }: { canvasId: Id<"canvases"> }) {
  const open = useOpenNoleThread();
  const markRunReviewed = useMutation(api.runs.markRunReviewed);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const tasks = useQuery(api.runs.listPendingRuns, { canvasId });

  const dismiss = useCallback(
    (task: PendingTask) => {
      void markRunReviewed({ runId: task.runId }).catch(() => {});
    },
    [markRunReviewed],
  );
  const openThread = useCallback(
    (threadId: string) => {
      open(threadId);
      setOverflowOpen(false);
    },
    [open],
  );

  // Le serveur ne lit pas l'horloge ; l'admission finale se décide ici.
  const now = Date.now();
  const pending = (tasks ?? []).filter((task) => isPendingReview(task, now));
  if (pending.length === 0) return null;

  const prominent = pending.filter(
    (task) => resolveTaskView(task, now).emphasis !== "compact",
  );
  const compact = pending.filter(
    (task) => resolveTaskView(task, now).emphasis === "compact",
  );
  const visible = compact.slice(0, MAX_COMPACT_VISIBLE);
  const overflow = compact.slice(MAX_COMPACT_VISIBLE);

  const card = (task: PendingTask) => (
    <TaskCard
      key={task.runId}
      task={task}
      onOpen={openThread}
      onDismiss={dismiss}
    />
  );

  return (
    <div className="flex w-full flex-col items-start gap-2">
      {prominent.map(card)}
      {compact.length > 0 && (
        <div className="flex flex-col items-start gap-2">
          {visible.map(card)}
          {overflow.length > 0 && (
            <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`${overflow.length} more tasks`}
                  className="flex shrink-0 items-center rounded-xl border border-slate-200 bg-surface px-3 py-1 text-xs font-medium text-slate-600 shadow-sm hover:bg-slate-50"
                >
                  +{overflow.length}
                </button>
              </PopoverTrigger>
              <PopoverContent side="top" align="start" className="w-auto p-2">
                <div className="flex flex-col items-start gap-2">
                  {overflow.map(card)}
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
    </div>
  );
}
