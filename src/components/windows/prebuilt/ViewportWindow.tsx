import { memo, useCallback, useMemo } from "react";
import {
  useReactFlow,
  useStore,
  type ReactFlowState,
} from "@xyflow/react";
import { TbDirections , TbLocation, TbRefresh, TbTrash } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import { ScrollArea } from "@/components/shadcn/scroll-area";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import InlineEditableText from "@/components/form-ui/InlineEditableText";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import {
  useCaptureFraming,
  useFramingMatch,
  useGoToFraming,
} from "@/hooks/useViewportFraming";
import { readFraming } from "@/lib/canvasViewportFraming";
import { cn } from "@/lib/utils";

type ViewportNodeRef = {
  id: string;
  nodeDataId: Id<"nodeDatas"> | undefined;
};

/**
 * Les nodes `viewport` du canvas, lus dans le store React Flow.
 *
 * C'est la seule source qui les porte tous : `canvasStore` ne garde pas les
 * nodes (cf. `CanvasInStore`), et `nodeDataStore` ne connaît pas les ids de
 * canvas dont la suppression a besoin.
 */
const selectViewportNodes = (state: ReactFlowState): ViewportNodeRef[] =>
  state.nodes
    .filter((node) => node.type === "viewport")
    .map((node) => ({
      id: node.id,
      nodeDataId: (node.data as { nodeDataId?: Id<"nodeDatas"> } | undefined)
        ?.nodeDataId,
    }));

/**
 * Le sélecteur reconstruit son tableau à chaque passage — donc à chaque frame
 * de drag. Cette égalité borne le re-render à un vrai changement de liste :
 * ajout, suppression, réordonnancement.
 */
function sameViewportNodes(a: ViewportNodeRef[], b: ViewportNodeRef[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (node, index) =>
        node.id === b[index].id && node.nodeDataId === b[index].nodeDataId,
    )
  );
}

/**
 * La fenêtre d'un node `viewport` : tous les repères du canvas, avec navigation,
 * renommage, recapture et suppression.
 *
 * Reprend la disposition de l'ancien `HotspotList` (panneau de la toolbar),
 * dont elle hérite aussi les affordances — boutons révélés au survol, titre
 * éditable en place.
 */
function ViewportWindow({ nodeDataId }: { nodeDataId: Id<"nodeDatas"> }) {
  const viewportNodes = useStore(selectViewportNodes, sameViewportNodes);

  return (
    <div className="flex h-full flex-col">
      <ScrollArea className="min-h-0 flex-1">
        {viewportNodes.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">
            No markers on this canvas.
          </div>
        ) : (
          <div className="flex flex-col gap-1 p-2">
            {viewportNodes.map((node) => (
              <ViewportRow
                key={node.id}
                canvasNodeId={node.id}
                nodeDataId={node.nodeDataId}
                isCurrent={node.nodeDataId === nodeDataId}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

function ViewportRow({
  canvasNodeId,
  nodeDataId,
  isCurrent,
}: {
  canvasNodeId: string;
  nodeDataId: Id<"nodeDatas"> | undefined;
  isCurrent: boolean;
}) {
  const values = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const captureFraming = useCaptureFraming();
  const goToFraming = useGoToFraming();
  const { deleteElements } = useReactFlow();

  const view = values?.view;
  const framing = useMemo(() => readFraming(view), [view]);
  const match = useFramingMatch(framing);

  const title = typeof values?.title === "string" ? values.title : "";

  const rename = useCallback(
    (nextTitle: string) => {
      if (!nodeDataId) return;
      void updateNodeDataValues({
        nodeDataId,
        values: { title: nextTitle.trim() },
      });
    },
    [nodeDataId, updateNodeDataValues],
  );

  const recapture = useCallback(() => {
    if (!nodeDataId) return;
    const next = captureFraming();
    if (!next) return;
    void updateNodeDataValues({ nodeDataId, values: { view: next } });
  }, [captureFraming, nodeDataId, updateNodeDataValues]);

  const goTo = useCallback(() => {
    if (framing) goToFraming(framing);
  }, [framing, goToFraming]);

  // La suppression passe par React Flow, comme le menu contextuel d'un node :
  // `useCanvasNodes` traduit le change `remove` en mutation Convex et gère la
  // cascade. Une mutation dédiée court-circuiterait tout ça.
  const remove = useCallback(() => {
    void deleteElements({ nodes: [{ id: canvasNodeId }] });
  }, [canvasNodeId, deleteElements]);

  return (
    <div
      className={cn(
        "group rounded-md border border-transparent p-1.5 transition hover:border-border hover:bg-muted/50",
        isCurrent && "border-border bg-muted/30",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          title={
            match === "here"
              ? "View is on this marker"
              : match === "near"
                ? "View is close to this marker"
                : undefined
          }
          className={cn(
            "size-2 shrink-0 rounded-full border transition-colors",
            match === "here"
              ? "border-emerald-600 bg-emerald-600"
              : match === "near"
                ? "border-emerald-600 bg-transparent"
                : "border-transparent bg-transparent",
          )}
        />
        <TbDirections  size={14} className="shrink-0 text-muted-foreground" />
        <InlineEditableText
          value={title}
          onSave={rename}
          as="span"
          className="min-w-0 flex-1 truncate text-base font-medium"
          inputClassName="text-base font-medium"
          placeholder="Untitled marker"
        />
      </div>
      <div className="mt-1 flex items-center gap-0.5 pl-6 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          title="Go to this marker"
          aria-label={`Go to marker ${title || "untitled"}`}
          disabled={!framing}
          onClick={goTo}
        >
          <TbLocation className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-6"
          title="Save the current view to this marker"
          aria-label="Save the current view"
          disabled={!nodeDataId}
          onClick={recapture}
        >
          <TbRefresh className="size-3.5" />
        </Button>
        <ConfirmableButton
          title="Delete this marker?"
          text="The node is removed from the canvas. This action is permanent."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          destructive
          onConfirm={remove}
        >
          <Button
            size="icon"
            variant="ghost"
            className="size-6 text-destructive hover:text-destructive"
            title="Delete this marker"
            aria-label="Delete this marker"
          >
            <TbTrash className="size-3.5" />
          </Button>
        </ConfirmableButton>
      </div>
    </div>
  );
}

export default memo(ViewportWindow);
