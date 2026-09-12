import { memo, useCallback, useMemo } from "react";
import { useStore, type ReactFlowState } from "@xyflow/react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Id } from "@/../convex/_generated/dataModel";
import { ScrollArea } from "@/components/shadcn/scroll-area";
import { useUpdateCanvasNode } from "@/hooks/useUpdateCanvasNode";
import {
  markersFromNodes,
  sameMarkers,
  sortMarkers,
  type MarkerRef,
} from "@/lib/viewportMarkers";
import MarkerRow from "./MarkerRow";

/**
 * Les nodes `viewport` du canvas, lus dans le store React Flow.
 *
 * C'est la seule source qui les porte tous : `canvasStore` ne garde pas les
 * nodes (cf. `CanvasInStore`), et `nodeDataStore` ne connaît pas les ids de
 * canvas dont la suppression a besoin.
 */
const selectMarkers = (state: ReactFlowState): MarkerRef[] =>
  markersFromNodes(state.nodes);

/**
 * Tous les repères du canvas : navigation, renommage, recapture, suppression,
 * réordonnancement au drag.
 *
 * Rendu par deux surfaces — la fenêtre singleton d'un node `viewport`
 * (`ViewportWindow`) et l'encart de la `CanvasToolbar` (`MarkersPanel`) — qui
 * ne diffèrent que par leur coquille. Doit vivre dans un `ReactFlowProvider`.
 */
function MarkerList({
  currentNodeDataId,
  onNavigate,
}: {
  /** Le repère « propriétaire », surligné. La fenêtre s'en sert, l'encart non. */
  currentNodeDataId?: Id<"nodeDatas">;
  onNavigate?: () => void;
}) {
  const markers = useStore(selectMarkers, sameMarkers);
  const sorted = useMemo(() => sortMarkers(markers), [markers]);
  const { updateCanvasNodes } = useUpdateCanvasNode();
  const sensors = useSensors(useSensor(PointerSensor));

  const ids = useMemo(() => sorted.map((marker) => marker.id), [sorted]);

  /**
   * Réécrit tous les rangs en une seule mutation.
   *
   * `useUpdateCanvasNode` applique déjà la mise à jour en local avant
   * l'aller-retour serveur (et la défait en cas d'échec) : la liste se
   * réordonne donc à l'instant du drop sans miroir local à maintenir. Des
   * index entiers réécrits en bloc plutôt qu'une indexation fractionnaire :
   * `api.nodes.patch` prend un tableau, et une liste de repères se compte sur
   * les doigts.
   */
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from === -1 || to === -1) return;

      void updateCanvasNodes(
        arrayMove(ids, from, to).map((nodeId, index) => ({
          nodeId,
          data: { order: index },
        })),
      );
    },
    [ids, updateCanvasNodes],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        {sorted.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No markers on this canvas.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={ids} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-1 p-2">
                {sorted.map((marker) => (
                  <MarkerRow
                    key={marker.id}
                    canvasNodeId={marker.id}
                    nodeDataId={marker.nodeDataId}
                    isCurrent={
                      currentNodeDataId !== undefined &&
                      marker.nodeDataId === currentNodeDataId
                    }
                    onNavigate={onNavigate}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </ScrollArea>
    </div>
  );
}

export default memo(MarkerList);
