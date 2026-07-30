import { type CSSProperties, type ReactNode } from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type {
  LayoutContainer,
  LayoutFieldPlacement,
} from "@/../convex/config/templateConfig";

// Couche d'édition de LayoutRenderer : sélection, survol et dnd posés sur le
// rendu RÉEL du layout. Compagnon du renderer, pas un second renderer — les
// styles flex (containerStyle / placementStyle) restent sa propriété exclusive
// et sont passés ici tels quels. Toute duplication de ces styles ferait
// diverger l'aperçu du canvas, ce qui annulerait l'intérêt d'éditer sur la
// maquette.
//
// Règle de fidélité : ces composants rendent la MÊME div que le renderer, avec
// des props en plus — jamais une div supplémentaire, qui changerait la boîte
// vue par le flex parent. Le contour est un `outline` et non un `border` : il
// se dessine hors de la boîte, sans reflow.

type LayoutEditor = {
  selectedId: string | null;
  hoveredId: string | null;
  onSelect: (nodeId: string) => void;
  onHover: (nodeId: string | null) => void;
};

// Préfixe des droppables « déposer DANS ce container ». Seuls les containers
// vides en portent un : ailleurs, ce sont les enfants qui sont les cibles, et
// un droppable couvrant tout le container leur volerait la collision.
const INTO_PREFIX = "into:";

const SELECTED_OUTLINE = "2px solid rgb(139 92 246)";
const HOVER_OUTLINE = "1px dashed rgb(148 163 184)";
const EMPTY_OUTLINE = "1px dashed rgb(203 213 225)";
const DROP_OUTLINE = "2px solid rgb(167 139 250)";

// Un container vide a une hauteur nulle (minHeight: 0 dans containerStyle) :
// aucune surface à cliquer, donc impossible à sélectionner ou à supprimer.
// Seule déviation assumée du rendu réel, et seulement en édition.
const EMPTY_MIN_SIZE = 24;

function selectionStyle(
  editor: LayoutEditor,
  nodeId: string,
): CSSProperties {
  if (editor.selectedId === nodeId) {
    return { outline: SELECTED_OUTLINE, outlineOffset: 1 };
  }
  if (editor.hoveredId === nodeId) {
    return { outline: HOVER_OUTLINE, outlineOffset: 1 };
  }
  return {};
}

function useEditableNode(nodeId: string, editor: LayoutEditor, draggable: boolean) {
  const sortable = useSortable({ id: nodeId, disabled: !draggable });

  const handlers = {
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      editor.onSelect(nodeId);
    },
    // onMouseOver et non onMouseEnter : il remonte, donc le stopPropagation du
    // node le plus INTERNE gagne — c'est lui qu'on veut surligner, pas ses
    // ancêtres.
    onMouseOver: (e: React.MouseEvent) => {
      e.stopPropagation();
      editor.onHover(nodeId);
    },
    onMouseLeave: () => editor.onHover(null),
  };

  const dragStyle: CSSProperties = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
    opacity: sortable.isDragging ? 0.4 : undefined,
    cursor: draggable ? "grab" : undefined,
  };

  return { sortable, handlers, dragStyle };
}

function EditablePlacement({
  placement,
  editor,
  style,
  children,
}: {
  placement: LayoutFieldPlacement;
  editor: LayoutEditor;
  style: CSSProperties;
  children: ReactNode;
}) {
  const { sortable, handlers, dragStyle } = useEditableNode(
    placement.id,
    editor,
    true,
  );

  return (
    <div
      ref={sortable.setNodeRef}
      style={{ ...style, ...dragStyle, ...selectionStyle(editor, placement.id) }}
      {...sortable.attributes}
      {...sortable.listeners}
      {...handlers}
    >
      {children}
    </div>
  );
}

function EditableContainer({
  container,
  editor,
  style,
  isRoot,
  children,
}: {
  container: LayoutContainer;
  editor: LayoutEditor;
  style: CSSProperties;
  isRoot: boolean;
  children: ReactNode;
}) {
  const isEmpty = container.children.length === 0;
  const { sortable, handlers, dragStyle } = useEditableNode(
    container.id,
    editor,
    !isRoot,
  );
  // `disabled` plutôt qu'un hook conditionnel : le droppable reste enregistré
  // mais sans rect, donc invisible à la détection de collision.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `${INTO_PREFIX}${container.id}`,
    disabled: !isEmpty,
  });

  const setRefs = (el: HTMLElement | null) => {
    sortable.setNodeRef(el);
    if (isEmpty) setDropRef(el);
  };

  const emptyStyle: CSSProperties = isEmpty
    ? { minHeight: EMPTY_MIN_SIZE, minWidth: EMPTY_MIN_SIZE, outline: EMPTY_OUTLINE }
    : {};
  const overStyle: CSSProperties = isOver
    ? { outline: DROP_OUTLINE, backgroundColor: "rgb(245 243 255)" }
    : {};

  const showBadge =
    editor.hoveredId === container.id || editor.selectedId === container.id;

  return (
    <div
      ref={setRefs}
      style={{
        ...style,
        ...emptyStyle,
        ...dragStyle,
        ...selectionStyle(editor, container.id),
        ...overStyle,
        // Ancre du badge ci-dessous. Toujours posée (et non basculée au
        // survol) pour qu'aucun descendant positionné ne change d'ancrage
        // d'une frame à l'autre.
        position: "relative",
      }}
      {...sortable.attributes}
      {...sortable.listeners}
      {...handlers}
    >
      <SortableContext
        items={container.children.map((c) => c.id)}
        strategy={
          container.direction === "row"
            ? horizontalListSortingStrategy
            : verticalListSortingStrategy
        }
      >
        {children}
      </SortableContext>

      {/* Hors flux (position: absolute) : le flex parent ne le voit pas, la
          disposition reste donc exactement celle du canvas réel.
          Posé À L'INTÉRIEUR de la boîte et non en débord : le cadre de
          l'aperçu est en overflow:hidden, un badge débordant vers le haut est
          rogné dès que le container affleure le bord — ce qui est toujours le
          cas de la racine. */}
      {showBadge && (
        <span
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: 1,
            pointerEvents: "none",
            fontSize: 9,
            lineHeight: "12px",
            padding: "0 4px",
            borderRadius: 3,
            color: "white",
            background:
              editor.selectedId === container.id
                ? "rgb(139 92 246)"
                : "rgb(148 163 184)",
          }}
        >
          {container.direction === "row" ? "Row" : "Column"}
          {isRoot ? " (root)" : ""}
        </span>
      )}
    </div>
  );
}

export { EditableContainer, EditablePlacement, INTO_PREFIX };
export type { LayoutEditor };
