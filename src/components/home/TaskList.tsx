import { Link } from "@tanstack/react-router";
import { TbArrowRight, TbChecks, TbCircleCheck } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import { useClearHomeTasks } from "@/hooks/useClearHomeTasks";
import type { CanvasCover } from "@/lib/canvasCover";
import {
  resolveRunStatus,
  type HomePendingThread,
} from "@/lib/threadRunStatus";
import TaskRow from "./TaskRow";

export type TaskCanvasInfo = { name: string; cover: CanvasCover };

interface TaskListProps {
  /** Déjà triées (cf. `useHomePendingTasks`). */
  tasks: HomePendingThread[];
  /** Les canvas que la home liste. Une tâche dont le canvas n'y est pas — un
   *  partage révoqué — n'est pas affichée : elle mènerait à un cul-de-sac. */
  canvases: ReadonlyMap<Id<"canvases">, TaskCanvasInfo>;
  /** Au-delà, la home renvoie vers l'Inbox plutôt que de devenir une liste. */
  limit?: number;
}

/**
 * « Needs your attention » : ce que Nolë a fait et qu'on n'a pas encore
 * regardé, tous canvas confondus.
 *
 * Une boîte de réception, comme le dock d'un canvas : une tâche y reste jusqu'à
 * ce qu'on l'ouvre ou qu'on l'écarte. Les deux surfaces lisent la même règle
 * (`isPendingReview`), donc écarter ici la retire aussi du dock, et
 * réciproquement.
 */
export default function TaskList({ tasks, canvases, limit }: TaskListProps) {
  const clearTasks = useClearHomeTasks();

  const listed = tasks.filter((task) => canvases.has(task.canvasId));
  const visible = limit ? listed.slice(0, limit) : listed;
  const hidden = listed.length - visible.length;

  // Tout ce qui ne tourne plus. Pas les tours en cours, que le serveur refuse
  // d'accuser : les compter promettrait un effet qui n'aurait pas lieu.
  const now = Date.now();
  const clearable = listed.filter(
    (task) => resolveRunStatus(task, now) !== "running",
  );

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-bold text-slate-900">
          Needs your attention
        </h2>
        {listed.length > 0 && (
          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-bold text-violet-700">
            {listed.length}
          </span>
        )}
        <span className="flex-1" />
        {clearable.length > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => clearTasks(clearable)}
            className="gap-1.5 text-slate-600"
          >
            <TbChecks />
            Clear all finished
          </Button>
        )}
      </div>

      {listed.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/40 px-4 py-4">
          <TbCircleCheck className="size-7 shrink-0 text-emerald-600" />
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-slate-900">
              You're all caught up
            </span>
            <span className="text-xs text-slate-500">
              When Nolë finishes something, it lands here until you've looked
              at it.
            </span>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {visible.map((task) => (
            <TaskRow
              key={task.threadId}
              task={task}
              // `listed` ne garde que les tâches dont le canvas est connu.
              canvas={canvases.get(task.canvasId)!}
              onClear={(cleared) => clearTasks([cleared])}
            />
          ))}
        </ul>
      )}

      {hidden > 0 && (
        <Link
          to="/inbox"
          className="flex items-center gap-1 self-start text-sm font-semibold text-brand hover:underline"
        >
          View all {listed.length} in Inbox
          <TbArrowRight />
        </Link>
      )}
    </section>
  );
}
