import { memo, useCallback, useMemo, useState, type MouseEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  TbDirections,
  TbDots,
  TbGripVertical,
  TbLocation,
  TbRefresh,
  TbTrash,
} from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button, buttonVariants } from "@/components/shadcn/button";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import InlineEditableText from "@/components/form-ui/InlineEditableText";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import {
  useCaptureFraming,
  useGoToFraming,
} from "@/hooks/useViewportFraming";
import { readFraming, type DeltaTarget } from "@/lib/canvasViewportFraming";
import TargetDeltaIndicator from "../navigation/TargetDeltaIndicator";
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
  // Encart : le « … » ouvre un menu, dont l'item supprimer arme ce dialogue
  // (mêmes textes que `ConfirmableButton`, dont la fenêtre garde l'usage).
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

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
  // Objet stable : un littéral inline recréerait le sélecteur à chaque render.
  const deltaTarget = useMemo<DeltaTarget | null>(
    () => (framing ? { kind: "framing", framing } : null),
    [framing],
  );

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

  // Encart : la ligne navigue au clic — hors titre (réservé au double-clic
  // de renommage : son texte porte `.cursor-text`) et hors boutons/champs.
  // Le bouton « Go » reste l'accès clavier et tactile.
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
  // seule leur disposition diffère (encart : tout sur une ligne).
  const titleControl = isViewer ? (
    <span
      className={cn(
        "min-w-0 flex-1 truncate font-medium",
        isPanel ? "text-sm" : "text-base",
      )}
    >
      {title || (
        <span className="italic text-muted-foreground">Untitled marker</span>
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
      inputClassName={cn("font-medium", isPanel ? "text-sm" : "text-base")}
      placeholder="Untitled marker"
    />
  );

  const goControl = (
    <Button
      size="icon"
      variant="ghost"
      className="size-6 shrink-0"
      title="Go to this marker"
      aria-label={`Go to marker ${title || "untitled"}`}
      disabled={!framing}
      onClick={goTo}
    >
      <TbLocation className="size-3.5" />
    </Button>
  );

  // Fenêtre : recapture + suppression en boutons directs (aspect d'origine).
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
  const dragListeners = { ...attributes, ...listeners };
  // Fenêtre : poignée à droite (aspect d'origine).
  const dragControl = isViewer ? null : (
    <button
      type="button"
      className="ml-auto cursor-grab touch-none rounded p-1 text-muted-foreground hover:text-foreground"
      title="Drag to reorder"
      aria-label={`Reorder marker ${title || "untitled"}`}
      {...dragListeners}
    >
      <TbGripVertical className="size-3.5" />
    </button>
  );

  // Encart : la poignée occupe le même slot que le cap + distance et le
  // remplace au survol (grille empilée, sans état) : au repos seul
  // l'indicateur prend de la place, le titre y gagne la largeur de la
  // poignée. `isDragging` garde la poignée visible, le pointeur ayant quitté
  // la ligne pendant le drag. Viewer : pas de drag, indicateur seul.
  const panelLeading = !isPanel ? null : isViewer ? (
    <TargetDeltaIndicator target={deltaTarget} />
  ) : (
    <span className="grid shrink-0 items-center">
        <span
          className={cn(
            "col-start-1 row-start-1 transition-opacity group-hover:opacity-0",
            isDragging && "opacity-0",
          )}
        >
          {/* Cap + distance vers le repère — rien quand la vue est dessus. */}
          <TargetDeltaIndicator target={deltaTarget} />
        </span>
        <button
          type="button"
          className={cn(
            // `hidden` bat `flex` en cascade (même spécificité, trié après) :
            // les deux display sont donc exclusifs, pas cumulés.
            isDragging
              ? "flex"
              : "hidden group-hover:flex",
            "col-start-1 row-start-1 cursor-grab touch-none items-center justify-center rounded p-1 text-muted-foreground/60 hover:text-foreground",
          )}
          title="Drag to reorder"
          aria-label={`Reorder marker ${title || "untitled"}`}
          {...dragListeners}
        >
          <TbGripVertical className="size-3.5" />
        </button>
      </span>
    );

  // Encart : recapture + suppression regroupées derrière un « … », la
  // suppression gardant sa confirmation (mêmes textes que la fenêtre).
  const panelMenu =
    isViewer || !isPanel ? null : (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-6 shrink-0"
              title="Marker actions"
              aria-label={`Actions for marker ${title || "untitled"}`}
            >
              <TbDots size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="bottom">
            <DropdownMenuItem
              disabled={!nodeDataId}
              onSelect={() => recapture()}
            >
              <TbRefresh className="size-3.5" />
              Save current view here
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setIsDeleteOpen(true)}
            >
              <TbTrash className="size-3.5" />
              Delete marker…
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this marker?</AlertDialogTitle>
              <AlertDialogDescription>
                The node is removed from the canvas. This action is permanent.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => remove()}
                className={buttonVariants({ variant: "destructive" })}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
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
        // par la ligne ou le bouton « Go », toujours visible.
        isPanel && "p-2 hover:bg-muted/60",
        isPanel && isCurrent && "bg-muted/60",
      )}
    >
      {isPanel ? (
        /* Encart : tout sur une ligne — slot poignée/indicateur, titre,
            « Go » toujours visible (découvrabilité + tactile), et un « … »
            pour recapture/suppression. */
        <div
          className={cn("flex items-center gap-1", framing && "cursor-pointer")}
          onClick={handleRowClick}
        >
          {panelLeading}
          {titleControl}
          {goControl}
          {panelMenu}
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            {/* Cap + distance vers le repère — rien quand la vue est dessus. */}
            <TargetDeltaIndicator target={deltaTarget} />
            <TbDirections
              size={14}
              className="shrink-0 text-muted-foreground"
            />
            {titleControl}
          </div>
          {/* `isDragging` garde la rangée d'actions visible : le pointeur
              quitte la ligne pendant le drag, et la poignée disparaîtrait sous
              la main. */}
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
        </>
      )}
    </div>
  );
}

export default memo(MarkerRow);
