import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useOpenNoleThread } from "@/hooks/useOpenNoleThread";
import { useNodeIdsByDataId } from "@/lib/nodeIdentity";
import CanvasTaskMarker from "./CanvasTaskMarker";
import type { PendingThread } from "@/lib/threadRunStatus";

/**
 * Les tâches Nolë en cours, ancrées sur le canvas aux nodes qu'elles touchent.
 *
 * Pendant du dock, pas doublon : le dock dit *quoi*, le canvas dit *où*. Le
 * canvas se vide tout seul à la fin des runs ; le dock garde ce qui attend
 * d'être relu, et rattrape ce que le canvas ne peut pas ancrer.
 *
 * Monte la même query que le dock, avec les mêmes arguments : le client Convex
 * partage l'abonnement, donc l'affichage ne coûte que son rendu — et les deux
 * surfaces ne peuvent pas se contredire, elles lisent la même ligne au même
 * instant.
 */
export default function CanvasTaskMarkers({
  canvasId,
}: {
  canvasId: Id<"canvases">;
}) {
  const openThread = useOpenNoleThread();

  const threads = useQuery(api.threads.listPendingThreads, { canvasId });

  // Pré-filtre volontairement sans horloge : la péremption et la rémanence se
  // décident dans chaque marqueur, qui porte sa propre minuterie. Ici on écarte
  // seulement ce qui ne pourra jamais être vivant — jamais lancé, ou déjà revu.
  const candidates = (threads ?? []).filter(
    (thread) =>
      thread.runStatus === "running" ||
      (thread.runEndedAt != null && thread.reviewedAt == null),
  );

  // Une seule résolution pour toutes les tâches, plutôt qu'un abonnement au
  // store React Flow par marqueur.
  const nodeIds = useNodeIdsByDataId(
    candidates.flatMap((thread) =>
      thread.touchedNodes.map((touch) => touch.nodeDataId),
    ),
  );

  // Le rang d'empilement se compte par ancrage, et non sur la liste entière :
  // deux tâches sur des régions différentes ne doivent pas se décaler l'une
  // l'autre, sinon une pastille sauterait quand une tâche sans rapport démarre.
  const seenPerAnchor = new Map<string, number>();

  return (
    <>
      {candidates.map((thread) => {
        const anchors = resolveAnchors(thread, nodeIds);
        const anchorKey = anchors.join(",");
        const stackIndex = seenPerAnchor.get(anchorKey) ?? 0;
        seenPerAnchor.set(anchorKey, stackIndex + 1);

        return (
          <CanvasTaskMarker
            key={thread.threadId}
            thread={thread}
            anchors={anchors}
            stackIndex={stackIndex}
            onOpen={openThread}
          />
        );
      })}
    </>
  );
}

/**
 * Les nodes encore sur le canvas parmi ceux que la tâche a touchés.
 *
 * La résolution fait office de filtre : un node supprimé depuis ne résout pas,
 * et sort donc de l'ancrage sans cas particulier — y compris ceux que la tâche
 * a elle-même supprimés.
 */
function resolveAnchors(
  thread: PendingThread,
  nodeIds: Map<Id<"nodeDatas">, string>,
): string[] {
  return thread.touchedNodes.flatMap((touch) => {
    const xyNodeId = nodeIds.get(touch.nodeDataId);
    return xyNodeId ? [xyNodeId] : [];
  });
}
