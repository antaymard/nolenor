import { Link } from "@tanstack/react-router";
import {
  TbAlertCircle,
  TbAlertTriangle,
  TbCheck,
  TbLoader2,
} from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { useResolvedRunStatus } from "@/hooks/useThreadRunStatus";
import { formatDistanceToNowStrict } from "@/lib/date-utils";
import {
  RUN_STATUS_BORDER,
  getDockStatusAppearance,
  pickDominantRunStatus,
  resolveRunStatus,
  runTimeAnchor,
  type HomePendingThread,
  type ResolvedRunStatus,
} from "@/lib/threadRunStatus";
import { cn } from "@/lib/utils";

/**
 * Ce que Nolë a laissé en plan, vu de la home.
 *
 * Deux densités pour la même matière, parce que les deux surfaces ne posent pas
 * la même question. La carte de reprise demande « qu'est-ce qui m'attend ? » et
 * répond par le détail — une ligne par tâche, ce qu'elle a fait en dernier.
 * Les cartes de la grille demandent « y a-t-il quelque chose ? » et répondent
 * d'un signe : une pastille, un compte, une date.
 *
 * Le vocabulaire visuel est celui du dock d'activité, à dessein : mêmes
 * icônes, mêmes teintes (cf. `threadRunStatus`). Une tâche vue depuis la home
 * doit se reconnaître au même coup d'œil qu'au-dessus du canvas.
 *
 * Aucun libellé d'état n'est écrit : la couleur et l'icône le disent, et la
 * home parle anglais quand le vocabulaire des tâches, lui, est français.
 */

/** Au-delà, la carte de reprise deviendrait une liste ; le reste se compte. */
const MAX_VISIBLE_TASKS = 3;

/**
 * L'état d'une tâche, en une icône. Les mêmes que celles du dock, à un détail
 * près : le travail en cours y est une orbe animée sur canvas, trop lourde pour
 * une page qui peut en afficher une par workspace.
 */
function TaskStatusIcon({
  status,
  className,
}: {
  status: ResolvedRunStatus;
  className?: string;
}) {
  const shared = cn("shrink-0", className);

  if (status === "running") {
    return <TbLoader2 className={cn(shared, "animate-spin text-violet-500")} />;
  }
  if (status === "error") {
    return <TbAlertCircle className={cn(shared, "text-red-500")} />;
  }
  if (status === "stale" || status === "aborted") {
    return <TbAlertTriangle className={cn(shared, "text-amber-500")} />;
  }
  return <TbCheck className={cn(shared, "text-emerald-600")} />;
}

/**
 * Depuis quand la tâche attend : la fin de son tour, ou son départ quand il n'y
 * a pas de fin (cf. `runTimeAnchor`). `null` quand elle n'a jamais démarré —
 * la ligne se passe alors de date plutôt que d'en inventer une.
 */
function formatTaskAge(task: HomePendingThread): string | null {
  const anchor = runTimeAnchor(task);
  if (anchor == null) return null;
  return formatDistanceToNowStrict(new Date(anchor), { addSuffix: true });
}

/**
 * Une tâche en attente, en une ligne cliquable : elle ouvre le canvas sur cette
 * conversation-là (cf. le param `?thread=`, consommé par `useCanvasBootstrap`).
 *
 * Composant à part entière, et non une ligne rendue en boucle, pour que chaque
 * tâche ait sa propre minuterie de péremption (`useResolvedRunStatus`) — un
 * `running` qu'on a cessé de croire doit virer à l'ambre tout seul.
 */
function PendingTaskRow({
  canvasId,
  task,
}: {
  canvasId: Id<"canvases">;
  task: HomePendingThread;
}) {
  const status = useResolvedRunStatus(task);
  const age = formatTaskAge(task);
  const activity = task.lastActivity?.text;
  const nodeCount = task.touchedNodesCount;

  return (
    <Link
      to="/canvas/$canvasId"
      params={{ canvasId }}
      search={{ thread: task.threadId }}
      // `relative z-10` : la carte de reprise porte un lien étiré sur toute sa
      // surface, qu'il faut repasser devant, sinon le clic ouvre le canvas sans
      // la conversation.
      className={cn(
        "relative z-10 flex items-center gap-2.5 rounded-lg border bg-white px-3 py-2",
        "transition-colors hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand)",
        RUN_STATUS_BORDER[status],
      )}
    >
      <TaskStatusIcon status={status} className="size-4" />

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-gray-800">
          {task.title || "Nolë"}
        </span>
        {/* Ce que l'agent a formulé en dernier, et l'ampleur du chantier. Rien
            à dire tant qu'aucun tool n'a parlé : la ligne disparaît plutôt que
            d'afficher un vide. */}
        {(activity || nodeCount > 0) && (
          <span className="flex min-w-0 items-baseline gap-1.5 text-xs text-gray-500">
            {activity && <span className="truncate">{activity}</span>}
            {nodeCount > 0 && (
              <span className="shrink-0 text-gray-400">
                {nodeCount} {nodeCount === 1 ? "block" : "blocks"}
              </span>
            )}
          </span>
        )}
      </span>

      {age && (
        <span className="shrink-0 text-xs whitespace-nowrap text-gray-400">
          {age}
        </span>
      )}
    </Link>
  );
}

/**
 * Le détail : une ligne par tâche, pour la carte de reprise.
 */
export function PendingTaskList({
  canvasId,
  tasks,
}: {
  canvasId: Id<"canvases">;
  tasks: HomePendingThread[];
}) {
  if (tasks.length === 0) return null;

  const visible = tasks.slice(0, MAX_VISIBLE_TASKS);
  const hidden = tasks.length - visible.length;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium text-gray-500">
        {tasks.length === 1
          ? "1 task waiting for you"
          : `${tasks.length} tasks waiting for you`}
      </p>

      {visible.map((task) => (
        <PendingTaskRow key={task.threadId} canvasId={canvasId} task={task} />
      ))}

      {hidden > 0 && (
        <p className="text-xs text-gray-400">
          +{hidden} more in this workspace
        </p>
      )}
    </div>
  );
}

/**
 * Le signe : une pastille, pour les cartes de la grille.
 *
 * Un seul statut pour tout le lot — le plus urgent (cf.
 * `pickDominantRunStatus`) —, et la date de la tâche la plus fraîche. Le détail
 * est à un clic, sur le canvas ; ici on répond seulement « oui, il y a quelque
 * chose, et voilà de quelle couleur ».
 *
 * Pas de minuterie, contrairement aux lignes détaillées : une carte de la
 * grille qui met un rendu à passer d'un violet à un ambre ne trompe personne.
 */
export function PendingTaskBadge({ tasks }: { tasks: HomePendingThread[] }) {
  if (tasks.length === 0) return null;

  const now = Date.now();
  const status = pickDominantRunStatus(
    tasks.map((task) => resolveRunStatus(task, now)),
  );
  const appearance = getDockStatusAppearance(status);

  const anchors = tasks
    .map(runTimeAnchor)
    .filter((anchor): anchor is number => anchor != null);
  const latest = anchors.length > 0 ? Math.max(...anchors) : null;

  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        title={appearance.description}
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-sm font-medium",
          appearance.className,
        )}
      >
        <TaskStatusIcon status={status} className="size-3" />
        {tasks.length} {tasks.length === 1 ? "task" : "tasks"}
      </span>

      {latest != null && (
        <span className="truncate text-xs text-gray-400">
          {formatDistanceToNowStrict(new Date(latest), { addSuffix: true })}
        </span>
      )}
    </div>
  );
}
