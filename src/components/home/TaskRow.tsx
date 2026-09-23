import { useNavigate } from "@tanstack/react-router";
import {
  TbAlertCircle,
  TbAlertTriangle,
  TbArrowUpRight,
  TbCheck,
  TbClock,
  TbLayoutGrid,
  TbLoader2,
} from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import {
  useResolvedRunStatus,
  useRunDuration,
} from "@/hooks/useThreadRunStatus";
import type { CanvasCover } from "@/lib/canvasCover";
import { formatDistanceToNowStrict } from "@/lib/date-utils";
import {
  RUN_STATUS_APPEARANCE,
  RUN_STATUS_BORDER,
  getDockStatusAppearance,
  runTimeAnchor,
  type HomePendingThread,
  type ResolvedRunStatus,
} from "@/lib/threadRunStatus";
import { cn } from "@/lib/utils";

/**
 * L'état d'une tâche, en une icône. Les mêmes que celles du dock, à un détail
 * près : le travail en cours y est une orbe animée sur canvas, trop lourde pour
 * une liste qui peut en afficher plusieurs.
 */
function TaskStatusIcon({ status }: { status: ResolvedRunStatus }) {
  if (status === "running") return <TbLoader2 className="animate-spin" />;
  if (status === "error") return <TbAlertCircle />;
  if (status === "stale" || status === "aborted") return <TbAlertTriangle />;
  return <TbCheck />;
}

/**
 * Ce que la ligne dit du travail. Un échec donne sa raison, que la dernière
 * action ne dit pas ; un tour resté sans réponse n'a rien formulé d'utile, on
 * explique plutôt quoi faire.
 */
function taskDetail(task: HomePendingThread, status: ResolvedRunStatus) {
  if (status === "error" && task.lastRunError) return task.lastRunError;
  if (status === "stale") return RUN_STATUS_APPEARANCE.stale.description;
  if (task.lastActivity?.text) return task.lastActivity.text;
  if (status === "running") return "Nolë is working on it…";
  return getDockStatusAppearance(status).description;
}

interface TaskRowProps {
  task: HomePendingThread;
  canvas: { name: string; cover: CanvasCover };
  onClear: (task: HomePendingThread) => void;
}

/**
 * Une tâche en attente, en une ligne : où (le canvas), quoi (la dernière
 * action, ou la raison d'un échec), depuis quand, combien de temps, et deux
 * gestes — ouvrir la conversation, ou l'écarter.
 *
 * Composant à part entière, et non une ligne rendue en boucle, pour que chaque
 * tâche ait sa minuterie de péremption (`useResolvedRunStatus`) et son compteur
 * de durée pendant un run.
 */
export default function TaskRow({ task, canvas, onClear }: TaskRowProps) {
  const navigate = useNavigate();
  const status = useResolvedRunStatus(task);
  const isRunning = status === "running";
  const appearance = getDockStatusAppearance(status);
  const duration = useRunDuration(task, isRunning);
  const anchor = runTimeAnchor(task);
  const detail = taskDetail(task, status);
  const title = task.title || "Nolë";

  const open = () => {
    void navigate({
      to: "/canvas/$canvasId",
      params: { canvasId: task.canvasId },
      search: { thread: task.threadId },
    });
  };

  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border bg-white py-2.5 pr-2.5 pl-3 transition-shadow hover:shadow-sm",
        RUN_STATUS_BORDER[status],
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg border text-lg",
          appearance.className,
        )}
        title={appearance.description}
      >
        <TaskStatusIcon status={status} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-900">
            {title}
          </span>
          <span className="flex max-w-44 shrink-0 items-center gap-1.5 rounded-md bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600 max-sm:hidden">
            <span className={cn("size-2 shrink-0 rounded-[3px]", canvas.cover.tile)} />
            <span className="truncate">{canvas.name}</span>
          </span>
          <span
            className={cn(
              "shrink-0 rounded-full border px-1.5 py-0.5 text-[11px] font-semibold leading-none max-md:hidden",
              appearance.className,
            )}
          >
            {appearance.label}
          </span>
        </div>
        <p
          className={cn(
            "truncate text-xs",
            status === "error" ? "text-red-600" : "text-slate-500",
          )}
        >
          {detail}
        </p>
      </div>

      <div className="flex w-32 shrink-0 flex-col items-end gap-0.5 text-xs text-slate-500 max-md:hidden">
        {anchor != null && (
          <span className="font-medium whitespace-nowrap text-slate-700">
            {formatDistanceToNowStrict(new Date(anchor), { addSuffix: true })}
          </span>
        )}
        <span className="flex items-center gap-2.5">
          {/* Un tour périmé n'aura jamais de fin : sa « durée » ne serait que
              l'âge de son départ, que la date au-dessus dit déjà. */}
          {duration && status !== "stale" && (
            <span className="flex items-center gap-1" title="Time spent">
              <TbClock className="size-3.5" />
              {duration}
            </span>
          )}
          {task.touchedNodesCount > 0 && (
            <span className="flex items-center gap-1" title="Blocks touched">
              <TbLayoutGrid className="size-3.5" />
              {task.touchedNodesCount}
            </span>
          )}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={open} className="gap-1">
          Open
          <TbArrowUpRight />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={() => onClear(task)}
          // Le serveur refuse d'accuser réception d'un tour en cours : il n'est
          // pas fini. Autant le dire que de laisser un clic sans effet.
          disabled={isRunning}
          title={isRunning ? "Still running" : "Mark as reviewed"}
          aria-label={
            isRunning ? `${title} is still running` : `Mark ${title} as reviewed`
          }
          className="hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
        >
          <TbCheck />
        </Button>
      </div>
    </li>
  );
}
