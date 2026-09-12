import { memo, useCallback, useMemo, type MouseEvent } from "react";
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
 * `CanvasToolbar` : les deux surfaces montrent la même liste, via la prop
 * `variant` (`window` = aspect d'origine, `panel` = version embellie).
 */
function MarkerRow({
  canvasNodeId,
  nodeDataId,
  isCurrent,
  onNavigate,
  variant = "window",
}: {
  canvasNodeId: string;
  nodeDataId: Id<"nodeDatas"> | undefined;
  isCurrent: boolean;
  /** Appelé après une navigation réussie — l'encart s'en sert pour se fermer. */
  onNavigate?: () => void;
  /**
   * `panel` = encart de la `CanvasToolbar` (embelli, « Go » toujours visible,
   * ligne cliquable) ; `window` = fenêtre `ViewportWindow`, inchangée.
   */
  variant?: "panel" | "window";
}) {
  const isPanel = variant === "panel";
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

  // Encart : la première ligne navigue au clic — hors titre (réservé au
  // double-clic de renommage : son texte porte `.cursor-text`) et hors
  // boutons/champs. Le bouton « Go » reste l'accès clavier et tactile.
  const handleRowClick = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      if (!isPanel || !framing) return;
      const target = event.target as HTMLElement;
      if (target.closest("button,input,a,.cursor-text")) return;
      goTo();
    },
    [framing, goTo, isPanel],
  );

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

  // Contrôles factorisés : les deux variantes composent les mêmes boutons,
  // seule leur visibilité diffère (encart : « Go » toujours visible).
  const goControl = (
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
  );

  const secondaryControls = isViewer ? null : (
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
    </>
  );

  // `touch-none` : sans lui le geste tactile scrolle la liste au lieu d'armer
  // le drag (même patron que `ImageNode`).
  const dragControl = isViewer ? null : (
    <button
      type="button"
      className={cn(
        "ml-auto cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground",
        // Encart : poignée discrète, révélée au survol comme les secondaires.
        isPanel &&
          "text-muted-foreground/60 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
        isPanel && isDragging && "opacity-100",
      )}
      title="Drag to reorder"
      aria-label={`Reorder marker ${title || "untitled"}`}
      {...attributes}
      {...listeners}
    >
      <TbGripVertical className="size-3.5" />
    </button>
  );

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
        // Variante encart : carte un peu plus généreuse ; la navigation passe
        // par la première ligne ou le bouton « Go », toujours visible.
        isPanel && "p-2 hover:bg-muted/60",
        isPanel && isCurrent && "bg-muted/60",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2",
          isPanel && framing && "cursor-pointer",
        )}
        onClick={isPanel ? handleRowClick : undefined}
      >
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
            isPanel && "size-2.5",
            match === "here"
              ? "border-emerald-600 bg-emerald-600"
              : match === "near"
                ? "border-emerald-600 bg-transparent"
                : "border-transparent bg-transparent",
            isPanel && match === "here" && "ring-2 ring-emerald-600/20",
          )}
        />
        {isPanel ? (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <TbDirections size={14} />
          </span>
        ) : (
          <TbDirections size={14} className="shrink-0 text-muted-foreground" />
        )}
        {isViewer ? (
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-medium",
              isPanel ? "text-sm" : "text-base",
            )}
          >
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
            className={cn(
              "min-w-0 flex-1 truncate font-medium",
              isPanel ? "text-sm" : "text-base",
            )}
            inputClassName={cn(
              "font-medium",
              isPanel ? "text-sm" : "text-base",
            )}
            placeholder="Untitled marker"
          />
        )}
      </div>
      {isPanel ? (
        /* Encart : le « Go » reste visible (découvrabilité + tactile), le reste
            se révèle au survol — et la première ligne navigue déjà. */
        <div className="mt-1 flex items-center gap-0.5 pl-8">
          {goControl}
          <span
            className={cn(
              "flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
              isDragging && "opacity-100",
            )}
          >
            {secondaryControls}
          </span>
          {dragControl}
        </div>
      ) : (
        /* `isDragging` garde la rangée d'actions visible : le pointeur quitte
            la ligne pendant le drag, et la poignée disparaîtrait sous la main. */
        <div
          className={cn(
            "mt-1 flex items-center gap-0.5 pl-6 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100",
            isDragging && "opacity-100",
          )}
        >
          {goControl}
          {secondaryControls}
          {dragControl}
        </div>
      )}
    </div>
  );
}

export default memo(MarkerRow);
