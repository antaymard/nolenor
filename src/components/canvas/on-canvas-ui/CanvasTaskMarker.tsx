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
 * Une tâche Nolë, ancrée au node qu'elle travaille.
 *
 * `NodeToolbar` pan avec le canvas mais ne subit pas le zoom : le bloc reste
 * lisible à toute échelle.
 *
 * Il ne paraît en revanche que sur une ancre unique. Les ancres arrivent bien
 * ici en liste, et `nodeId` en accepte plusieurs — c'est le placement qui ne
 * suit pas : `NodeToolbar` vise le centre de la boîte englobante, un point qui
 * n'appartient à aucun node et qui, dès que les nodes s'éloignent, flotte dans
 * le vide au milieu de rien. En attendant un placement qui tienne à plusieurs,
 * la liste reste telle quelle et seul l'affichage se retient.
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
  // tous supprimés depuis. Le dock, lui, la montre : c'est son rôle. Plusieurs
  // ancres : rien à ancrer non plus, faute d'un endroit honnête où poser le bloc
  // (cf. l'en-tête). Même report sur le dock, qui lui nomme les nodes touchés.
  if (!isLive || nodeIds.length !== 1) return null;

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
