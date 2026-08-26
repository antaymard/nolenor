import { NodeToolbar, Position } from "@xyflow/react";
import { useMemo } from "react";
import { useIsLiveOnCanvas } from "@/hooks/useThreadRunStatus";
import type { PendingThread } from "@/lib/threadRunStatus";
import TaskCard from "./TaskCard";

/** Écart au bas de la boîte englobante, en pixels d'écran. */
const TOOLBAR_OFFSET = 10;

/** De combien on décale deux tâches ancrées exactement au même endroit. */
const STACK_STEP = 56;

/**
 * Une tâche Nolë, ancrée aux nodes qu'elle travaille.
 *
 * `NodeToolbar` pan avec le canvas mais ne subit pas le zoom : le bloc reste
 * lisible à toute échelle. `nodeId` reçoit ici **tous** les nodes touchés, et
 * l'ancrage se fait sur leur boîte englobante — une tâche qui a créé cinq nodes
 * porte un bloc, pas cinq. On ne désigne donc aucun node « principal » : le bloc
 * dit « cette tâche concerne cette région ».
 *
 * C'est le même bloc qu'au dock, à la ligne de nodes près : elle nommerait ce
 * qui est déjà juste au-dessus.
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
      <TaskCard thread={thread} onOpen={onOpen} />
    </NodeToolbar>
  );
}
