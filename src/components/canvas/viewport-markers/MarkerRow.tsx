import { memo, useCallback, useMemo } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  TbDirections,
  TbGripVertical,
  TbLocation,
  TbRefresh,
  TbTrash,
} from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
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
import { useDeleteCanvasElements } from "@/hooks/useDeleteCanvasElements";
import { useCanvasStore } from "@/stores/canvasStore";
import { cn } from "@/lib/utils";

/**
 * Une ligne de la liste des repères : navigation, renommage en place,
 * recapture du cadrage, suppression, poignée de réordonnancement.
 *
 * Extraite de `ViewportWindow` pour être partagée avec l'encart de la
 * `CanvasToolbar` : les deux surfaces montrent la même liste, elles ne
 * diffèrent que par leur coquille.
 */
function MarkerRow({
  canvasNodeId,
  nodeDataId,
  isCurrent,
  onNavigate,
}: {
  canvasNodeId: string;
  nodeDataId: Id<"nodeDatas"> | undefined;
  isCurrent: boolean;
  /** Appelé après une navigation réussie — l'encart s'en sert pour se fermer. */
  onNavigate?: () => void;
}) {
  const values = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const captureFraming = useCaptureFraming();
  const goToFraming = useGoToFraming();
  const { deleteCanvasElements } = useDeleteCanvasElements();

  // Un viewer n'a que la navigation : le serveur refuse déjà ses écritures
  // (`requireCanvasAccess("editor")`), les lui proposer ne produisait qu'un
  // toast d'erreur. Même sélecteur booléen que `CustomNode` / `CustomWindow`.
  const isViewer = useCanvasStore(
    (state) => state.canvas?._permission === "viewer",
  );

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: canvasNodeId, disabled: isViewer });

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
    if (!framing) return;
    goToFraming(framing);
    onNavigate?.();
  }, [framing, goToFraming, onNavigate]);

  // La suppression passe par `useDeleteCanvasElements` (donc React Flow +
  // historique annulable), comme le menu contextuel d'un node :
  // `useCanvasNodes` traduit le change `remove` en mutation Convex et gère la
  // cascade. Une mutation dédiée court-circuiterait tout ça.
  const remove = useCallback(() => {
    void deleteCanvasElements(
      { nodes: [{ id: canvasNodeId }] },
      { label: "Delete viewport" },
    );
  }, [canvasNodeId, deleteCanvasElements]);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
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
        <TbDirections size={14} className="shrink-0 text-muted-foreground" />
        {isViewer ? (
          <span className="min-w-0 flex-1 truncate text-base font-medium">
            {title || (
              <span className="italic text-muted-foreground">
                Untitled marker
              </span>
            )}
          </span>
        ) : (
          <InlineEditableText
            value={title}
            onSave={rename}
            as="span"
            className="min-w-0 flex-1 truncate text-base font-medium"
            inputClassName="text-base font-medium"
            placeholder="Untitled marker"
          />
        )}
      </div>
      {/* `isDragging` garde la rangée d'actions visible : le pointeur quitte
          la ligne pendant le drag, et la poignée disparaîtrait sous la main. */}
      <div
        className={cn(
          "mt-1 flex items-center gap-0.5 pl-6 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
          isDragging && "opacity-100",
        )}
      >
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
        {isViewer ? null : (
          <>
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
            {/* `touch-none` : sans lui le geste tactile scrolle la liste au
                lieu d'armer le drag (même patron que `ImageNode`). */}
            <button
              type="button"
              className="ml-auto cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground"
              title="Drag to reorder"
              aria-label={`Reorder marker ${title || "untitled"}`}
              {...attributes}
              {...listeners}
            >
              <TbGripVertical className="size-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default memo(MarkerRow);
