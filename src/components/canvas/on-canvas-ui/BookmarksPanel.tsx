import { useEffect, useRef, useState } from "react";
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
  TbArrowRight,
  TbFocusCentered,
  TbGripVertical,
  TbSquare,
  TbSquares,
} from "react-icons/tb";
import type { IconType } from "react-icons";
import type { Id } from "@/../convex/_generated/dataModel";
import type { BookmarkTarget } from "@/../convex/schemas/canvasBookmarksSchema";
import {
  useCanvasBookmarks,
  type ResolvedBookmark,
} from "@/hooks/useCanvasBookmarks";
import { useGoToBookmark } from "@/hooks/useGoToBookmark";
import { useCanvasStore } from "@/stores/canvasStore";
import { cn } from "@/lib/utils";

/** Dit d'un coup d'œil ce que vise le repère, et donc s'il suivra ou non. */
function targetIcon(target: BookmarkTarget): IconType {
  if (target.kind === "node") return TbSquare;
  if (target.kind === "selection") return TbSquares;
  return TbFocusCentered;
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

  const Icon = targetIcon(bookmark.target);
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

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className="flex items-center gap-1.5 rounded-md px-1.5 py-1 hover:bg-accent"
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
          className="min-w-0 flex-1 rounded bg-background px-1 text-sm outline-none ring-1 ring-primary"
        />
      ) : (
        <button
          type="button"
          // Le libellé entier est la cible du « go to » : viser la flèche seule
          // ferait d'une liste de raccourcis une liste de boutons minuscules.
          // Un repère mort reste cliquable pour être renommé/supprimé, mais ne
          // navigue plus — d'où le `disabled` sur la seule navigation.
          disabled={bookmark.isDangling}
          onClick={() => onGoTo(bookmark)}
          onDoubleClick={() => setDraft(bookmark.displayLabel)}
          className={cn(
            "min-w-0 flex-1 truncate text-left text-sm",
            bookmark.isDangling &&
              "cursor-default italic text-muted-foreground",
          )}
          title={
            bookmark.isDangling
              ? "Cette cible n'est plus sur le canvas"
              : bookmark.displayLabel
          }
        >
          {bookmark.displayLabel}
        </button>
      )}

      <button
        type="button"
        disabled={bookmark.isDangling}
        onClick={() => onGoTo(bookmark)}
        aria-label="Go to bookmark"
        title="Go to"
        className="text-muted-foreground hover:text-foreground disabled:opacity-30"
      >
        <TbArrowRight size={15} />
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
        Chargement…
      </p>
    );
  }

  if (order.length === 0) {
    return (
      <p className="max-w-64 px-2 py-3 text-center text-sm text-muted-foreground">
        Aucun repère. Clic droit sur un node, une sélection ou le canvas pour en
        poser un.
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
        <div className="flex max-h-80 w-72 flex-col gap-0.5 overflow-y-auto p-1">
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
