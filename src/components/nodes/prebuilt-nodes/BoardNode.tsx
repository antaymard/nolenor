import {
  memo,
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  Position,
  useStore,
  ViewportPortal,
  type ReactFlowState,
} from "@xyflow/react";
import { TbLayoutGrid, TbLayoutKanban, TbPlus, TbX } from "react-icons/tb";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeHandles from "../NodeHandles";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import { NodeToolbarLabel } from "../toolbar/NodeToolbarLabel";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";
import LayoutTreeRenderer from "@/components/layout/LayoutTreeRenderer";
import BookmarkedBadge from "@/components/nodes/BookmarkedBadge";
import NodeCollaboratorsPill from "@/components/canvas/presence/NodeCollaboratorsPill";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import {
  useBoardChildren,
  useBoardLayout,
  type BoardChild,
} from "@/hooks/useBoardLayout";
import { useIsFrameHovered } from "@/stores/frameHoverStore";
import { useIsNodeAttached } from "@/stores/noleStore";
import { useIsNodeBookmarked } from "@/stores/bookmarkedNodesStore";
import { useBoardDropIndex, useBoardDropStore } from "@/stores/boardDropStore";
import {
  BOARD_ATTR,
  GHOST_ATTR,
  SPACE_ATTR,
  offsetWithin,
} from "@/lib/boardDom";
import { colors, resolveColor } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import {
  BOARD_PRESETS,
  SPACE_MIN_HEIGHT,
  SPACE_MIN_WIDTH,
  listBoardSpaces,
  readBoardLayout,
  reuseSpaceIds,
  type BoardLayout,
  type BoardLeaf,
  type BoardPreset,
  type BoardSpace,
} from "@/../convex/config/boardConfig";
import {
  findLayoutParentId,
  findLayoutNode,
  genLayoutId,
  insertLayoutNode,
  removeLayoutNode,
  type LayoutContainer,
} from "@/../convex/lib/layoutTree";
import type { XyNodeProps } from "@/types/domain";

/** Entre deux nodes empilés dans un espace. */
const SPACE_GAP = 8;

const PRESET_OPTIONS: Array<{
  value: BoardPreset;
  label: string;
  icon: ReactNode;
}> = [
  { value: "kanban", label: "Columns", icon: <TbLayoutKanban /> },
  { value: "matrix", label: "Matrix", icon: <TbLayoutGrid /> },
];

/** Le modèle dont l'arbre a la forme : deux niveaux de containers = matrice. */
function presetOf(layout: BoardLayout): BoardPreset {
  return layout.children.some((child) => child.kind === "container")
    ? "matrix"
    : "kanban";
}

/**
 * Un conteneur dont les enfants sont RANGÉS : son arbre de layout (cf.
 * `convex/config/boardConfig.ts`) se termine en espaces, et chaque node
 * déposé dans un espace s'y empile, étiré à sa largeur, dans l'ordre de sa
 * clé (`placement`).
 *
 * Le rendu est une vraie flexbox. Chaque espace y contient une boîte fantôme
 * par node rangé, à sa hauteur ; `useBoardLayout` lit où elles tombent et y
 * pose les vrais nodes, qui restent des nodes React Flow ordinaires, rendus
 * au-dessus du board.
 *
 * Comme la frame : se déplace et se sélectionne par tout son corps, et
 * s'entoure quand un drag le vise. Contrairement à elle, il ne se
 * redimensionne pas : sa taille est celle de son contenu.
 */
function BoardNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const values = useNodeDataValues(nodeDataId);
  const layout = useMemo(() => readBoardLayout(values?.layout), [values]);
  const { updateNodeDataValues } = useUpdateNodeDataValues();

  const childrenBySpace = useBoardChildren(xyNode.id, layout);
  const contentRef = useRef<HTMLDivElement>(null);
  useBoardLayout({
    boardId: xyNode.id,
    contentRef,
    revision: childrenBySpace,
  });

  const isDropTarget = useIsFrameHovered(xyNode.id);
  const isAttachedToNole = useIsNodeAttached(xyNode.id);
  const isBookmarked = useIsNodeBookmarked(xyNode.id);
  const nodeColor =
    colors[resolveColor(xyNode.data?.color as string | undefined, true)];

  const setLayout = useCallback(
    (next: BoardLayout) => {
      if (!nodeDataId) return;
      void updateNodeDataValues({ nodeDataId, values: { layout: next } });
    },
    [nodeDataId, updateNodeDataValues],
  );

  const choosePreset = (preset: string) => {
    // `single` rend "" quand on re-clique l'option active.
    if (!layout || !preset || preset === presetOf(layout)) return;
    setLayout(reuseSpaceIds(BOARD_PRESETS[preset as BoardPreset](), layout));
  };

  const spaceCount = layout ? listBoardSpaces(layout).length : 0;

  /** Un espace de plus, juste après celui-ci, dans le même container. */
  const addSpaceAfter = (spaceId: string) => {
    if (!layout) return;
    const parentId = findLayoutParentId(layout, spaceId);
    if (!parentId) return;
    const parent = findLayoutNode(
      layout,
      parentId,
    ) as LayoutContainer<BoardLeaf>;
    const index = parent.children.findIndex((child) => child.id === spaceId);
    setLayout(
      insertLayoutNode(layout, parentId, index + 1, {
        kind: "space",
        id: genLayoutId("s"),
      }),
    );
  };

  /** Ses nodes retombent dans le premier espace (cf. `resolveSpaceId`). */
  const removeSpace = (spaceId: string) => {
    if (!layout || spaceCount <= 1) return;
    setLayout(removeLayoutNode(layout, spaceId).tree);
  };

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode} position={Position.Top}>
        <NodeToolbarLabel>Layout</NodeToolbarLabel>
        <ToggleGroup
          type="single"
          variant="default"
          value={layout ? presetOf(layout) : ""}
          onValueChange={choosePreset}
        >
          {PRESET_OPTIONS.map(({ value, label, icon }) => (
            <ToggleGroupItem
              key={value}
              value={value}
              aria-label={label}
              title={label}
              className="h-8 min-w-8 [&_svg:not([class*='size-'])]:size-[18px]"
            >
              {icon}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </CanvasNodeToolbar>

      <NodeHandles showSourceHandles={xyNode.selected} nodeId={xyNode.id} />

      <div
        {...{ [BOARD_ATTR]: xyNode.id }}
        className={cn(
          "relative h-full w-full rounded-[5px] border-2",
          "transition-[background-color,border-color,box-shadow] duration-100",
          nodeColor.frameBorder,
          nodeColor.frameBg,
          // Transparent, le board ne serait plus qu'un nuage de cartes : un
          // pointillé garde sa forme de conteneur.
          nodeColor === colors.transparent && "border-dashed border-slate-300",
          xyNode.selected && "ring-2 ring-blue-500/70",
          !xyNode.selected &&
            !isDropTarget &&
            "hover:ring-1 hover:ring-blue-400/50",
          isDropTarget && "border-blue-500",
          isAttachedToNole &&
            "after:pointer-events-none after:absolute after:-inset-1 after:rounded-[8px] after:border-2 after:border-dashed after:border-violet-500/90",
        )}
      >
        {/* À sa taille naturelle, hors du node : c'est elle que la mesure lit
            pour dimensionner le board. Positionné, il est l'`offsetParent`
            des fantômes (cf. `offsetWithin`). */}
        <div ref={contentRef} className="absolute top-0 left-0 w-max">
          {layout ? (
            <LayoutTreeRenderer
              tree={layout}
              renderLeaf={(leaf, { parentDirection }) =>
                leaf.kind === "space" ? (
                  <SpaceSlot
                    space={leaf}
                    nodes={childrenBySpace.get(leaf.id) ?? []}
                    canRemove={spaceCount > 1}
                    showControls={!!xyNode.selected}
                    onAdd={addSpaceAfter}
                    onRemove={removeSpace}
                  />
                ) : (
                  <div
                    className="shrink-0 self-stretch border-black/10"
                    style={
                      parentDirection === "row"
                        ? { borderLeftWidth: 1 }
                        : { borderTopWidth: 1 }
                    }
                  />
                )
              }
            />
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              Invalid board layout
            </div>
          )}
        </div>
        {isBookmarked && <BookmarkedBadge />}
        <NodeCollaboratorsPill nodeId={xyNode.id} />
      </div>
      <DropIndicatorLayer boardId={xyNode.id} contentRef={contentRef} />
    </>
  );
}

const DROP_MARKER_ATTR = "data-board-drop-marker";

type XY = { x: number; y: number };

function sameXY(a?: XY, b?: XY) {
  return a?.x === b?.x && a?.y === b?.y;
}

/**
 * La ligne d'insertion d'un drag qui vise ce board, peinte dans le calque du
 * viewport, au-dessus des nodes (même calque que le titre des frames).
 *
 * Placée sur le repère que l'espace visé pose dans son flux, au milieu de
 * l'écart qui le précède : entre deux cartes, pas sur le bord de la suivante.
 */
function DropIndicatorLayer({
  boardId,
  contentRef,
}: {
  boardId: string;
  contentRef: RefObject<HTMLDivElement | null>;
}) {
  const target = useBoardDropStore((state) =>
    state.target?.boardId === boardId ? state.target : null,
  );
  const origin = useStore(
    (state: ReactFlowState) =>
      state.nodeLookup.get(boardId)?.internals.positionAbsolute,
    sameXY,
  );
  const [line, setLine] = useState<(XY & { width: number }) | null>(null);

  useLayoutEffect(() => {
    const root = contentRef.current;
    const marker = root?.querySelector<HTMLElement>(`[${DROP_MARKER_ATTR}]`);
    if (!target || !root || !marker) {
      setLine(null);
      return;
    }
    const frame = root.offsetParent as HTMLElement | null;
    const offset = offsetWithin(marker, root);
    setLine({
      x: offset.x + root.offsetLeft + (frame?.clientLeft ?? 0),
      y:
        offset.y + root.offsetTop + (frame?.clientTop ?? 0) - SPACE_GAP / 2 - 1,
      width: marker.offsetWidth,
    });
  }, [target, contentRef]);

  if (!line || !origin) return null;
  return (
    <ViewportPortal>
      <div
        className="pointer-events-none absolute top-0 left-0 h-0.5 rounded-full bg-blue-500"
        style={{
          transform: `translate(${origin.x + line.x}px, ${origin.y + line.y}px)`,
          width: line.width,
        }}
      />
    </ViewportPortal>
  );
}

/**
 * Un espace : la colonne où s'empilent les fantômes de ses nodes. La ligne
 * d'insertion est dans le flux (la mise en page est gelée pendant le drag),
 * les contrôles hors flux : sélectionner le board ne doit pas changer sa
 * taille.
 */
function SpaceSlot({
  space,
  nodes,
  canRemove,
  showControls,
  onAdd,
  onRemove,
}: {
  space: BoardSpace;
  nodes: BoardChild[];
  canRemove: boolean;
  showControls: boolean;
  onAdd: (spaceId: string) => void;
  onRemove: (spaceId: string) => void;
}) {
  const dropIndex = useBoardDropIndex(space.id);

  const items: ReactNode[] = nodes.map((node) => (
    <div
      key={node.id}
      {...{ [GHOST_ATTR]: node.id }}
      className="shrink-0"
      style={{ height: node.height }}
    />
  ));
  if (dropIndex !== null) {
    items.splice(
      Math.min(dropIndex, items.length),
      0,
      // Un repère dans le flux, invisible : la ligne elle-même est peinte
      // au-dessus des nodes (cf. `DropIndicatorLayer`), les cartes
      // couvriraient tout ce qui est dessiné dans le board.
      <div
        key="drop-indicator"
        {...{ [DROP_MARKER_ATTR]: "" }}
        className="h-0 shrink-0"
      />,
    );
  }

  return (
    <div
      {...{ [SPACE_ATTR]: space.id }}
      className={cn(
        "group/space relative flex flex-col rounded-md bg-black/[0.03] p-2",
        dropIndex !== null && "bg-blue-500/10",
      )}
      style={{
        width: SPACE_MIN_WIDTH,
        minHeight: SPACE_MIN_HEIGHT,
        gap: SPACE_GAP,
      }}
    >
      {items}
      {showControls && (
        <div className="absolute inset-x-0 bottom-1 flex justify-center gap-1 opacity-0 transition-opacity group-hover/space:opacity-100">
          <SpaceButton
            label="Add a space after"
            onClick={() => onAdd(space.id)}
          >
            <TbPlus />
          </SpaceButton>
          {canRemove && (
            <SpaceButton
              label="Remove this space"
              onClick={() => onRemove(space.id)}
            >
              <TbX />
            </SpaceButton>
          )}
        </div>
      )}
    </div>
  );
}

function SpaceButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(event) => {
        // Le clic reste au bouton : il ne (dé)sélectionne rien sur le canvas.
        event.stopPropagation();
        onClick();
      }}
      className="nodrag nopan flex size-6 items-center justify-center rounded bg-white/80 text-muted-foreground hover:bg-white hover:text-foreground [&_svg]:size-4"
    >
      {children}
    </button>
  );
}

export default memo(BoardNode, areNodePropsEqual);
