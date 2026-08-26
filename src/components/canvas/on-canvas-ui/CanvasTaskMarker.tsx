import { NodeToolbar, Position } from "@xyflow/react";
import { useMemo } from "react";
import {
  useIsLiveOnCanvas,
  useResolvedRunStatus,
} from "@/hooks/useThreadRunStatus";
import {
  getDockStatusAppearance,
  getTaskPillLabel,
  type PendingThread,
} from "@/lib/threadRunStatus";
import { cn } from "@/lib/utils";
import TaskPillBody from "./TaskPill";

/** Écart au bas de la boîte englobante, en pixels d'écran. */
const TOOLBAR_OFFSET = 10;

/** De combien on décale deux tâches ancrées exactement au même endroit. */
const STACK_STEP = 30;

/**
 * Une tâche Nolë, ancrée aux nodes qu'elle travaille.
 *
 * `NodeToolbar` pan avec le canvas mais ne subit pas le zoom : la pastille reste
 * lisible à toute échelle. `nodeId` reçoit ici **tous** les nodes touchés, et
 * l'ancrage se fait sur leur boîte englobante — une tâche qui a créé cinq nodes
 * porte une pastille, pas cinq. On ne désigne donc aucun node « principal » : la
 * pastille dit « cette tâche concerne cette région ».
 */
export default function CanvasTaskMarker({
  thread,
  anchors,
  stackIndex,
  onOpen,
}: {
  thread: PendingThread;
  /** Ids React Flow des nodes encore vivants que la tâche a touchés. */
  anchors: readonly string[];
  /** Rang parmi les tâches ancrées au même endroit, pour ne pas se superposer. */
  stackIndex: number;
  onOpen: (threadId: string) => void;
}) {
  const isLive = useIsLiveOnCanvas(thread);
  const status = useResolvedRunStatus(thread);
  const appearance = getDockStatusAppearance(status);

  // `NodeToolbar` reconstruit son sélecteur de store quand `nodeId` change de
  // référence : sans ce mémo, il se réabonnerait à chaque rendu.
  const anchorKey = anchors.join(",");
  const nodeIds = useMemo(
    () => (anchorKey ? anchorKey.split(",") : []),
    [anchorKey],
  );

  // Rien à ancrer — tâche qui vient de démarrer, tâche de pure lecture, ou nodes
  // tous supprimés depuis. Le dock, lui, la montre : c'est son rôle.
  if (!isLive || nodeIds.length === 0) return null;

  const isRunning = status === "running";

  return (
    <NodeToolbar
      nodeId={nodeIds}
      // Sans `isVisible` explicite, le toolbar ne s'afficherait qu'à la
      // sélection du node.
      isVisible
      // `Position.Bottom` et non le défaut : `CanvasNodeToolbar` occupe déjà le
      // haut à la sélection, les deux se recouvriraient.
      position={Position.Bottom}
      offset={TOOLBAR_OFFSET + stackIndex * STACK_STEP}
    >
      <button
        type="button"
        onClick={() => onOpen(thread.threadId)}
        // Le libellé est tronqué dans une pastille étroite, et il n'y a pas de
        // popover ici : le survol natif est le seul moyen de lire l'action
        // entière sans ouvrir la conversation.
        title={getTaskPillLabel(thread)}
        className={cn(
          "flex h-7 max-w-[220px] items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium shadow-sm",
          "animate-in fade-in zoom-in-95 duration-200",
          appearance.className,
        )}
      >
        {/* Pas de puce de node, seule différence avec le dock : le node est
            juste au-dessus de la pastille, la nommer n'apprendrait rien. Le
            libellé, lui, est le même des deux côtés. */}
        <TaskPillBody
          thread={thread}
          appearance={appearance}
          isRunning={isRunning}
        />
      </button>
    </NodeToolbar>
  );
}
