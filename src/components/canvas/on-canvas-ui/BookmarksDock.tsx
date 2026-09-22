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
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { HiOutlineTrash } from "react-icons/hi";
import {
  TbBookmark,
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
import { Button } from "@/components/shadcn/button";
import { NODE_TYPE_ICON_MAP } from "@/components/nodes/prebuilt-nodes/nodeIconMap";
import { getTemplateIcon } from "@/components/fields/registry/templateIcons";
import {
  useCanvasBookmarks,
  type ResolvedBookmark,
} from "@/hooks/useCanvasBookmarks";
import { useGoToBookmark } from "@/hooks/useGoToBookmark";
import type { DeltaTarget } from "@/lib/canvasViewportFraming";
import TargetDeltaIndicator from "@/components/canvas/navigation/TargetDeltaIndicator";
import {
  isBookmarksDockOpen,
  setBookmarksDockOpen,
} from "@/lib/bookmarksDockStorage";
import { useCanvasStore } from "@/stores/canvasStore";
import { useWindowsStore } from "@/stores/windowsStore";
import type { NodeType } from "@/types/domain/nodeTypes";
import { cn } from "@/lib/utils";

/**
 * Verrou d'axe du drag, en constante de module : un littéral passé à
 * `modifiers` est un tableau neuf à chaque rendu, que dnd-kit relit à chaque
 * frame de déplacement (même raison que `COLUMN_MODIFIERS` dans `Table.tsx`).
 */
const DOCK_MODIFIERS = [restrictToHorizontalAxis];

/** Durée de l'ouverture d'une card au survol. */
const EXPAND_MS = 150;

/**
 * La cible de l'indicateur de cap pour un repère : `node` et `selection`
 * suivent leurs nodes (positions absolues, frame comprise), `framing` est un
 * point figé. `null` quand le repère est mort (node supprimé) : la card ne
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

/** Un bouton de la rangée d'actions, révélée au survol. */
function CardAction({
  icon: Icon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  icon: IconType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground",
        "hover:bg-background disabled:opacity-30",
        destructive ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      <Icon size={15} />
    </button>
  );
}

/**
 * Une card du dock.
 *
 * Deux rangées empilées dans une boîte plus courte qu'elles : `justify-end` +
 * `overflow-hidden` gardent la seule rangée de repos visible, et le survol
 * rend la card assez haute pour découvrir les actions AU-DESSUS. C'est la
 * hauteur qui s'anime, pas une translation : la rangée de repos reste donc
 * clouée en bas et ne bouge pas d'un pixel pendant que la card grandit.
 *
 * `focus-within` en plus de `hover` : les actions sont dans l'ordre de
 * tabulation, elles doivent apparaître quand on les atteint au clavier.
 */
function BookmarkDockCard({
  bookmark,
  expandable,
  onOpen,
  onGoTo,
  onRename,
  onRemove,
}: {
  bookmark: ResolvedBookmark;
  /** Faux pendant un réordonnancement — cf. `isReordering` dans le dock. */
  expandable: boolean;
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
        // Les deux transitions sont composées ICI, en inline, et pas en
        // classe : dnd-kit pose la sienne en style inline, une utilitaire
        // `transition-[height]` serait purement et simplement écrasée. Du
        // coup `motion-reduce:` ne peut rien non plus — c'est la règle
        // `.bookmark-dock-card` d'`index.css` qui coupe l'animation.
        transition: [transition, `height ${EXPAND_MS}ms var(--ease-out)`]
          .filter(Boolean)
          .join(", "),
        opacity: isDragging ? 0.5 : 1,
      }}
      className={cn(
        "bookmark-dock-card group flex h-10 w-44 shrink-0 flex-col justify-end",
        "overflow-hidden rounded-lg",
        // Grandir sous le curseur pendant un drag invaliderait les rects que
        // dnd-kit a mesurés au `dragstart`, et les collisions partiraient en
        // vrille.
        expandable &&
          "hover:h-18 hover:bg-accent focus-within:h-18 focus-within:bg-accent",
      )}
    >
      {/* `pointer-events-none` au repos : sans ça la rangée, invisible mais
          présente, avalerait le clic « ouvrir » sur le haut de la card. */}
      <div
        className={cn(
          "flex h-8 shrink-0 items-center justify-center gap-0.5 opacity-0",
          "pointer-events-none transition-opacity duration-150",
          "group-hover:pointer-events-auto group-hover:opacity-100",
          "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
          "motion-reduce:transition-none",
        )}
      >
        <CardAction
          icon={TbLocation}
          label="Go to"
          disabled={bookmark.isDangling}
          onClick={() => onGoTo(bookmark)}
        />
        <CardAction icon={TbPencil} label="Rename" onClick={startRename} />
        <CardAction
          icon={HiOutlineTrash}
          label="Delete"
          destructive
          onClick={() => onRemove(bookmark._id)}
        />
      </div>

      <div className="flex h-10 shrink-0 items-center gap-1 px-1">
        <button
          type="button"
          className="shrink-0 cursor-grab touch-none text-muted-foreground hover:text-foreground"
          aria-label="Reorder bookmark"
          {...attributes}
          {...listeners}
        >
          <TbGripVertical size={14} />
        </button>

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
            // Tout le corps de la card est la cible : l'icône, le nom et le
            // cap forment un seul bouton, les actions vivent au-dessus. Un
            // repère mort ne mène nulle part, mais reste renommable et
            // supprimable par la rangée d'actions.
            // Pas de double-clic pour renommer : le simple clic ouvre
            // maintenant une window, un double l'aurait déclenché deux fois
            // avant que le rename démarre. C'est le bouton Edit du survol qui
            // le remplace.
            disabled={bookmark.isDangling}
            onClick={() => onOpen(bookmark)}
            className={cn(
              "flex min-w-0 flex-1 items-center gap-1.5 text-left",
              bookmark.isDangling && "cursor-default",
            )}
            title={
              bookmark.isDangling
                ? "This target is no longer on the canvas"
                : bookmark.displayLabel
            }
          >
            <Icon
              size={15}
              className={cn(
                "shrink-0 text-muted-foreground",
                bookmark.isDangling && "opacity-50",
              )}
            />
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm",
                bookmark.isDangling && "italic text-muted-foreground",
              )}
            >
              {bookmark.displayLabel}
            </span>
            <TargetDeltaIndicator target={deltaTarget} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Le dock des repères : un îlot à soi, posé à droite de la `CanvasToolbar`.
 *
 * Une bande horizontale et pas un dropdown : les repères sont des raccourcis
 * de navigation, ils servent en continu — les cacher derrière une ouverture
 * qui se referme à chaque saut les rendait inutilisables en rafale. L'état
 * ouvert est retenu pour tous les canvas (cf. `bookmarksDockStorage`).
 *
 * La largeur ne se calcule pas : l'îlot est posé dans une colonne de grille
 * bornée (cf. la rangée du bas dans `routes/canvas/$canvasId.tsx`), et le
 * scroll horizontal prend le relais quand les cards n'y tiennent plus. C'est
 * ce qui le fait reculer tout seul devant les windows minimisées, et reprendre
 * la place dès qu'il n'y en a plus.
 */
export default function BookmarksDock() {
  const canvasId = useCanvasStore((state) => state.canvas?._id);
  const [isOpen, setIsOpen] = useState(isBookmarksDockOpen);
  const { bookmarks, isLoading, rename, reorder, remove } = useCanvasBookmarks({
    canvasId,
    enabled: isOpen,
  });
  const goToBookmark = useGoToBookmark();
  const openWindow = useWindowsStore((state) => state.openWindow);
  const { getNode } = useReactFlow();
  // Seuil d'activation : le corps de la card est cliquable, sans lui dnd-kit
  // avalerait le clic « ouvrir ».
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const [isReordering, setIsReordering] = useState(false);

  // Ordre local pendant le drag : la mutation part en même temps, mais la
  // bande doit se réordonner sous le doigt sans attendre l'aller-retour.
  const [order, setOrder] = useState<Array<ResolvedBookmark>>([]);
  // L'ordre qu'on vient d'envoyer au serveur, tant qu'il ne l'a pas confirmé.
  // Sans lui, n'importe quel re-render arrivant entre le drag et la réponse
  // (l'édition d'un node re-résout les libellés) réinstallerait l'ordre
  // serveur, encore ancien : la card sauterait en arrière puis en avant.
  const pendingOrderRef = useRef<string | null>(null);

  useEffect(() => {
    if (bookmarks === undefined) return;
    const serverOrder = bookmarks.map((item) => item._id).join(",");

    if (pendingOrderRef.current !== null) {
      const pending = pendingOrderRef.current;
      // Un ajout ou une suppression pendant l'aller-retour : la confirmation
      // qu'on attendait ne viendra jamais sous cette forme. On adopte le
      // serveur plutôt que de figer la bande sur un ordre périmé.
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

  function toggleOpen() {
    const next = !isOpen;
    setIsOpen(next);
    setBookmarksDockOpen(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    setIsReordering(false);
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
   * Le clic sur le corps d'une card ouvre le node en window, et retombe sur la
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
      const nodeDataId = node?.data?.nodeDataId as
        | Id<"nodeDatas">
        | undefined;
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
    // `items-end!` et pas `items-end` : `.canvas-ui-container` est déclarée
    // hors de tout `@layer`, elle bat donc toutes les utilitaires Tailwind —
    // c'est déjà pourquoi tous les îlots du canvas écrivent `px-0!`. Sans le
    // `!`, son `items-center` gagnerait et une card qui grandit au survol
    // pousserait vers le HAUT ET le BAS.
    <div className="canvas-ui-container min-w-0 items-end! px-0!">
      <Button
        variant={isOpen ? "default" : "ghost"}
        size="icon"
        className="h-10 w-10 shrink-0 rounded-lg"
        onClick={toggleOpen}
        aria-expanded={isOpen}
        aria-label="Bookmarks"
        title="Bookmarks: jump to a saved spot"
      >
        <TbBookmark size={19} />
      </Button>

      {isOpen &&
        (isLoading ? (
          <span className="flex h-10 shrink-0 items-center px-2 text-sm whitespace-nowrap text-muted-foreground">
            Loading…
          </span>
        ) : order.length === 0 ? (
          <span className="flex h-10 shrink-0 items-center px-2 text-sm whitespace-nowrap text-muted-foreground">
            No bookmarks — right-click a node, a selection or the canvas.
          </span>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={DOCK_MODIFIERS}
            onDragStart={() => setIsReordering(true)}
            onDragCancel={() => setIsReordering(false)}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={order.map((item) => item._id)}
              strategy={horizontalListSortingStrategy}
            >
              {/* `items-end` : une card qui grandit au survol pousse vers le
                  haut, la rangée de repos ne bouge pas. Pas de hauteur fixe
                  sur le scroller, sinon il rognerait cette croissance. */}
              <div className="flex min-w-0 items-end gap-0.5 overflow-x-auto scrollbar-hide">
                {order.map((bookmark) => (
                  <BookmarkDockCard
                    key={bookmark._id}
                    bookmark={bookmark}
                    expandable={!isReordering}
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
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ))}
    </div>
  );
}
