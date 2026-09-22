import { useEffect, useMemo, useRef, useState } from "react";
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
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HiOutlineTrash } from "react-icons/hi";
import {
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
import { cn } from "@/lib/utils";

/**
 * La cible de l'indicateur de cap pour un repère : `node` et `selection`
 * suivent leurs nodes (positions absolues, frame comprise), `framing` est un
 * point figé. `null` quand le repère est mort (node supprimé) : le bouton
 * go-to est désactivé de toute façon.
 *
 * `useMemo` et pas d'objet inline : `useTargetDelta` compare sa cible par
 * `Object.is` dans le sélecteur, un littéral frais re-rendrait à chaque frame.
 */
function useBookmarkDeltaTarget(
  bookmark: ResolvedBookmark,
): DeltaTarget | null {
  const kind = bookmark.target.kind;
  const nodeId =
    bookmark.target.kind === "node" ? bookmark.target.nodeId : undefined;
  const nodeIds =
    bookmark.target.kind === "selection" ? bookmark.target.nodeIds : undefined;
  const framing =
    bookmark.target.kind === "framing" ? bookmark.target.framing : undefined;
  return useMemo<DeltaTarget | null>(() => {
    if (kind === "node") {
      if (bookmark.isDangling) return null;
      return { nodeId: nodeId as string };
    }
    if (kind === "selection") {
      if (bookmark.isDangling) return null;
      return { nodeIds: nodeIds as readonly string[] };
    }
    return { point: { x: (framing as { cx: number }).cx, y: (framing as { cy: number }).cy } };
  }, [kind, nodeId, nodeIds, framing, bookmark.isDangling]);
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
  onGoTo,
  onRename,
  onRemove,
}: {
  bookmark: ResolvedBookmark;
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

  const Icon = targetIcon(bookmark);
  const deltaTarget = useBookmarkDeltaTarget(bookmark);
  const isEditing = draft !== null;

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

  function startRename() {
    if (draft === null) setDraft(bookmark.displayLabel);
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-1.5 rounded-md px-1.5 py-1.5 hover:bg-accent"
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        aria-label="Reorder bookmark"
        {...attributes}
        {...listeners}
      >
        <TbGripVertical size={14} />
      </button>

      <Icon
        size={15}
        className={cn(
          "shrink-0 text-muted-foreground",
          bookmark.isDangling && "opacity-50",
        )}
      />

      {isEditing ? (
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
          className="min-w-0 flex-1 rounded bg-background px-1 text-sm outline-none ring-1 ring-primary"
        />
      ) : (
        <button
          type="button"
          // Le libellé entier est la cible du « go to » : viser la flèche seule
          // ferait d'une liste de raccourcis une liste de boutons minuscules.
          // Un repère mort reste affiché pour être renommé/supprimé via le
          // crayon et la corbeille, mais ne navigue plus — d'où le `disabled`
          // sur le libellé et la flèche, sans bloquer le rename.
          disabled={bookmark.isDangling}
          onClick={() => onGoTo(bookmark)}
          onDoubleClick={startRename}
          className={cn(
            "min-w-0 flex-1 truncate text-left text-sm",
            bookmark.isDangling &&
              "cursor-default italic text-muted-foreground",
          )}
          title={
            bookmark.isDangling
              ? "This target is no longer on the canvas"
              : bookmark.displayLabel
          }
        >
          {bookmark.displayLabel}
        </button>
      )}

      <TargetDeltaIndicator target={deltaTarget} />
      <button
        type="button"
        disabled={bookmark.isDangling}
        onClick={() => onGoTo(bookmark)}
        aria-label="Go to bookmark"
        title="Go to"
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
      >
        <TbLocation size={15} />
      </button>
      {/* Le crayon plutôt que le seul double-clic : le rename existe depuis
          toujours, mais rien ne le disait. Il reste actif sur un repère mort :
          renommer est la seule chose utile qu'on puisse encore lui faire avec
          le supprimer. */}
      <button
        type="button"
        onClick={startRename}
        aria-label="Rename bookmark"
        title="Rename"
        className="text-muted-foreground hover:text-foreground"
      >
        <TbPencil size={15} />
      </button>
      <button
        type="button"
        onClick={() => onRemove(bookmark._id)}
        aria-label="Delete bookmark"
        title="Delete"
        className="text-muted-foreground hover:text-destructive"
      >
        <HiOutlineTrash size={15} />
      </button>
    </div>
  );
}

/**
 * La liste des repères du canvas courant, rendue dans le dropdown de la
 * `CanvasToolbar`.
 *
 * Monté seulement quand le panneau est ouvert (cf. `CanvasToolbar`) : c'est ce
 * qui tient la promesse du `enabled` de `useCanvasBookmarks` — aucune
 * souscription tant que personne ne regarde.
 */
export default function BookmarksPanel({
  onNavigate,
}: {
  /** Referme le dropdown une fois la navigation lancée. */
  onNavigate: () => void;
}) {
  const canvasId = useCanvasStore((state) => state.canvas?._id);
  const { bookmarks, isLoading, rename, reorder, remove } = useCanvasBookmarks({
    canvasId,
  });
  const goToBookmark = useGoToBookmark();
  const sensors = useSensors(useSensor(PointerSensor));

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

  if (isLoading) {
    return (
      <p className="px-2 py-3 text-center text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }

  if (order.length === 0) {
    return (
      <p className="max-w-64 px-2 py-3 text-center text-sm text-muted-foreground">
        No bookmarks. Right-click a node, a selection, or the canvas to add
        one.
      </p>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={order.map((item) => item._id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex max-h-80 w-80 flex-col gap-0.5 overflow-y-auto p-1">
          {order.map((bookmark) => (
            <SortableBookmarkRow
              key={bookmark._id}
              bookmark={bookmark}
              onGoTo={(item) => {
                if (goToBookmark(item.target)) onNavigate();
              }}
              onRename={(bookmarkId, label) =>
                void rename({ bookmarkId, label: label === "" ? null : label })
              }
              onRemove={(bookmarkId) => void remove({ bookmarkId })}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
