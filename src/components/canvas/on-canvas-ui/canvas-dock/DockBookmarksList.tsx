import { useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  TbBookmarkOff,
  TbFocusCentered,
  TbGripVertical,
  TbLocation,
  TbPencil,
  TbSquare,
  TbSquares,
} from "react-icons/tb";
import type { IconType } from "react-icons";
import type { Id } from "@/../convex/_generated/dataModel";
import { MAX_BOOKMARK_LABEL_LENGTH } from "@/../convex/schemas/canvasBookmarksSchema";
import { NODE_TYPE_ICON_MAP } from "@/components/nodes/prebuilt-nodes/nodeIconMap";
import { getTemplateIcon } from "@/components/fields/registry/templateIcons";
import {
  useCanvasBookmarks,
  type ResolvedBookmark,
} from "@/hooks/useCanvasBookmarks";
import { useGoToBookmark } from "@/hooks/useGoToBookmark";
import type { DeltaTarget } from "@/lib/canvasViewportFraming";
import TargetDeltaIndicator from "@/components/canvas/navigation/TargetDeltaIndicator";
import { useCanvasStore } from "@/stores/canvasStore";
import { useWindowsStore } from "@/stores/windowsStore";
import type { NodeType } from "@/types/domain/nodeTypes";
import DockList from "./DockList";
import { rowEnterProps } from "./dockRowEnter";
import DockRow from "./DockRow";

/**
 * Verrou d'axe du drag, en constante de module : un littéral passé à
 * `modifiers` est un tableau neuf à chaque rendu, que dnd-kit relit à chaque
 * frame de déplacement (même raison que `COLUMN_MODIFIERS` dans `Table.tsx`).
 */
const LIST_MODIFIERS = [restrictToVerticalAxis];

/**
 * La cible de l'indicateur de cap pour un repère : `node` et `selection`
 * suivent leurs nodes (positions absolues, frame comprise), `framing` est un
 * point figé. `null` quand le repère est mort (node supprimé) : la ligne ne
 * navigue plus de toute façon.
 *
 * `useMemo` et pas d'objet inline : `useTargetDelta` compare sa cible par
 * `Object.is` dans le sélecteur, un littéral frais re-rendrait à chaque frame.
 * Dépend du `target` du doc plutôt que du repère entier : Convex garde
 * l'identité de ses champs tant que le doc ne change pas, et un renommage ne
 * doit donc pas réveiller l'indicateur.
 */
function useBookmarkDeltaTarget(
  bookmark: ResolvedBookmark,
): DeltaTarget | null {
  const { target, isDangling } = bookmark;
  return useMemo<DeltaTarget | null>(() => {
    if (isDangling) return null;
    if (target.kind === "node") return { nodeId: target.nodeId };
    if (target.kind === "selection") return { nodeIds: target.nodeIds };
    return { point: { x: target.framing.cx, y: target.framing.cy } };
  }, [target, isDangling]);
}

/** Dit d'un coup d'œil ce que vise le repère, et donc s'il suivra ou non. */
function targetIcon(bookmark: ResolvedBookmark): IconType {
  if (bookmark.target.kind === "selection") return TbSquares;
  if (bookmark.target.kind === "framing") return TbFocusCentered;
  // kind === "node" : l'icône du node bookmarké, custom nodes compris.
  // Repli sur le carré historique quand le node a disparu.
  if (bookmark.nodeType === "custom")
    return getTemplateIcon(bookmark.templateIconName);
  return (
    (bookmark.nodeType ? NODE_TYPE_ICON_MAP[bookmark.nodeType] : undefined) ??
    TbSquare
  );
}

function SortableBookmarkRow({
  bookmark,
  onOpen,
  onGoTo,
  onRename,
  onRemove,
}: {
  bookmark: ResolvedBookmark;
  onOpen: (bookmark: ResolvedBookmark) => void;
  onGoTo: (bookmark: ResolvedBookmark) => void;
  onRename: (bookmarkId: Id<"canvasBookmarks">, label: string) => void;
  onRemove: (bookmarkId: Id<"canvasBookmarks">) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: bookmark._id });
  const [draft, setDraft] = useState<string | null>(null);

  const deltaTarget = useBookmarkDeltaTarget(bookmark);

  function commitRename() {
    if (draft === null) return;
    const trimmed = draft.trim();
    // Un libellé vidé n'efface pas le repère : il le rend à son titre vivant
    // côté node, et au libellé par défaut ailleurs.
    if (trimmed !== bookmark.displayLabel) {
      onRename(bookmark._id, trimmed);
    }
    setDraft(null);
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      <DockRow
        icon={targetIcon(bookmark)}
        label={bookmark.displayLabel}
        title={
          bookmark.isDangling
            ? "This target is no longer on the canvas"
            : bookmark.displayLabel
        }
        muted={bookmark.isDangling}
        disabled={bookmark.isDangling}
        dragHandle={
          <button
            type="button"
            className="flex h-9 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground hover:text-foreground"
            aria-label="Reorder bookmark"
            {...attributes}
            {...listeners}
          >
            <TbGripVertical size={14} />
          </button>
        }
        trailing={<TargetDeltaIndicator target={deltaTarget} />}
        onClick={() => onOpen(bookmark)}
        editor={
          draft === null ? undefined : (
            <input
              autoFocus
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === "Enter") commitRename();
                if (event.key === "Escape") setDraft(null);
              }}
              onFocus={(event) => event.target.select()}
              maxLength={MAX_BOOKMARK_LABEL_LENGTH}
              className="h-9 min-w-0 flex-1 rounded-md bg-background px-2 text-sm outline-none ring-1 ring-primary"
            />
          )
        }
        actions={[
          {
            icon: TbLocation,
            label: "Go to",
            disabled: bookmark.isDangling,
            onClick: () => onGoTo(bookmark),
          },
          {
            // Reste actif sur un repère mort : renommer est, avec retirer le
            // repère, la seule chose utile qu'on puisse encore lui faire.
            icon: TbPencil,
            label: "Rename",
            onClick: () => setDraft(bookmark.displayLabel),
          },
          {
            // La même icône et le même libellé que la bascule du menu
            // contextuel du node : c'est le même geste, vu d'ailleurs. Une
            // corbeille laissait croire qu'on supprimait le node lui-même.
            icon: TbBookmarkOff,
            label: "Remove bookmark",
            destructive: true,
            onClick: () => onRemove(bookmark._id),
          },
        ]}
      />
    </div>
  );
}

/**
 * La liste des repères du canvas, telle que la déplie le dock.
 *
 * Réordonnable : son ordre est enregistré côté serveur
 * (`api.canvasBookmarks.reorder`), d'où la poignée de drag — et d'où son
 * absence sur les windows minimisées, dont l'ordre ne survit pas au
 * rechargement.
 */
export default function DockBookmarksList({
  onClose,
}: {
  /** Ferme la liste : branché sur le Toggle du dock dans `CanvasDock`. */
  onClose?: () => void;
}) {
  const canvasId = useCanvasStore((state) => state.canvas?._id);
  const { bookmarks, isLoading, rename, reorder, remove } = useCanvasBookmarks({
    canvasId,
  });
  const goToBookmark = useGoToBookmark();
  const openWindow = useWindowsStore((state) => state.openWindow);
  const { getNode } = useReactFlow();
  // Seuil d'activation : le corps de la ligne est cliquable, sans lui dnd-kit
  // avalerait le clic « ouvrir ».
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  // Ordre local pendant le drag : la mutation part en même temps, mais la
  // liste doit se réordonner sous le doigt sans attendre l'aller-retour.
  const [order, setOrder] = useState<Array<ResolvedBookmark>>([]);
  // L'ordre qu'on vient d'envoyer au serveur, tant qu'il ne l'a pas confirmé.
  // Sans lui, n'importe quel re-render arrivant entre le drag et la réponse
  // (l'édition d'un node re-résout les libellés) réinstallerait l'ordre
  // serveur, encore ancien : la ligne sauterait en arrière puis en avant.
  const pendingOrderRef = useRef<string | null>(null);

  useEffect(() => {
    if (bookmarks === undefined) return;
    const serverOrder = bookmarks.map((item) => item._id).join(",");

    if (pendingOrderRef.current !== null) {
      const pending = pendingOrderRef.current;
      // Un ajout ou une suppression pendant l'aller-retour : la confirmation
      // qu'on attendait ne viendra jamais sous cette forme. On adopte le
      // serveur plutôt que de figer la liste sur un ordre périmé.
      const sameSet =
        pending.split(",").sort().join(",") ===
        bookmarks
          .map((item) => item._id)
          .sort()
          .join(",");
      if (sameSet && pending !== serverOrder) return;
      pendingOrderRef.current = null;
    }
    setOrder(bookmarks);
  }, [bookmarks]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = order.findIndex((item) => item._id === active.id);
    const newIndex = order.findIndex((item) => item._id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const next = arrayMove(order, oldIndex, newIndex);
    const orderedIds = next.map((item) => item._id);
    setOrder(next);
    pendingOrderRef.current = orderedIds.join(",");
    void reorder({ orderedIds });
  }

  /**
   * Le clic sur une ligne ouvre le node en window, et retombe sur la
   * navigation canvas quand il n'y a pas de window à ouvrir : `openWindow`
   * tranche lui-même (il rend `false` pour un type sans window) et les repères
   * `framing`/`selection` ne visent de toute façon aucun node unique.
   *
   * Même repli que les pastilles de mention et les liens du side panel.
   */
  function handleOpen(bookmark: ResolvedBookmark) {
    const { target } = bookmark;
    if (target.kind === "node") {
      const node = getNode(target.nodeId);
      const nodeDataId = node?.data?.nodeDataId as Id<"nodeDatas"> | undefined;
      if (node?.type && nodeDataId) {
        const opened = openWindow({
          xyNodeId: node.id,
          nodeDataId,
          nodeType: node.type as NodeType,
        });
        if (opened) return;
      }
    }
    goToBookmark(target);
  }

  return (
    <DockList
      title="Bookmarks"
      count={order.length > 0 ? order.length : undefined}
      isEmpty={!isLoading && order.length === 0}
      onClose={onClose}
      emptyLabel={
        isLoading
          ? "Loading…"
          : "No bookmarks yet. Right-click a node, a selection or the canvas to add one."
      }
    >
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={LIST_MODIFIERS}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={order.map((item) => item._id)}
          strategy={verticalListSortingStrategy}
        >
          {order.map((bookmark, index) => (
            <div key={bookmark._id} {...rowEnterProps(index)}>
              <SortableBookmarkRow
                bookmark={bookmark}
                onOpen={handleOpen}
                onGoTo={(item) => void goToBookmark(item.target)}
                onRename={(bookmarkId, label) =>
                  void rename({
                    bookmarkId,
                    label: label === "" ? null : label,
                  })
                }
                onRemove={(bookmarkId) => void remove({ bookmarkId })}
              />
            </div>
          ))}
        </SortableContext>
      </DndContext>
    </DockList>
  );
}
