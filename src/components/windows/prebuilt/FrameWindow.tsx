import { useMemo } from "react";
import {
  Background,
  BackgroundVariant,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  useStore,
  type Edge,
  type Node,
  type ReactFlowState,
} from "@xyflow/react";
import { shallow } from "zustand/shallow";
import { nodeTypes } from "@/components/nodes/nodeTypes";
import { edgeTypes } from "@/components/edges/edgeTypes";
import { CANVAS_MAX_ZOOM, CANVAS_MIN_ZOOM } from "@/lib/canvasViewportFraming";
import { colors, resolveColor } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

const FIT_VIEW_OPTIONS = { padding: 0.1 };

/**
 * La frame en grand : son contenu, rendu comme sur le canvas, dans une window.
 *
 * C'est la vue d'une frame compacte, dont la carte masque le contenu — mais la
 * window s'ouvre aussi sur une frame dépliée, par les gestes « ouvrir »
 * explicites.
 *
 * v1 en lecture : on pan, on zoome, on ouvre un node au double-clic (sa
 * window s'empile sur celle-ci). Ni sélection, ni drag, ni connexion — tout
 * ce qui écrirait passe par le canvas.
 *
 * Les nodes sont lus dans le store React Flow DU CANVAS (la window vit sous
 * son provider) et rendus dans un second `ReactFlow`, sous son propre
 * provider : sans lui, `<ReactFlow>` réutiliserait celui du canvas et les deux
 * vues se partageraient un seul état.
 */
export default function FrameWindow({ xyNodeId }: { xyNodeId: string }) {
  const children = useStore(
    (state: ReactFlowState) =>
      state.nodes.filter((node) => node.parentId === xyNodeId),
    shallow,
  );
  const edges = useStore((state: ReactFlowState) => state.edges, shallow);
  // Habillée aux couleurs de la frame — même fond que sur le canvas, points
  // dans sa teinte : on retrouve dans la window le cadre qu'on vient d'ouvrir.
  const frameColor = useStore(
    (state: ReactFlowState) =>
      state.nodeLookup.get(xyNodeId)?.data?.color as string | undefined,
  );
  const palette = colors[resolveColor(frameColor, true)];

  const flowNodes = useMemo(() => children.map(toStandaloneNode), [children]);
  const flowEdges = useMemo(() => {
    const ids = new Set(children.map((node) => node.id));
    return edges
      .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
      .map(toReadOnlyEdge);
  }, [children, edges]);

  if (flowNodes.length === 0) {
    return (
      <div
        className={cn(
          "flex h-full items-center justify-center text-sm text-muted-foreground",
          palette.frameBg,
        )}
      >
        This frame is empty
      </div>
    );
  }

  return (
    <ReactFlowProvider>
      <div className={cn("h-full w-full", palette.frameBg)}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={FIT_VIEW_OPTIONS}
          minZoom={CANVAS_MIN_ZOOM}
          maxZoom={CANVAS_MAX_ZOOM}
          // Mêmes gestes que le canvas : molette et trackpad pannent, le
          // pinch zoome.
          panOnScroll
          panOnScrollMode={PanOnScrollMode.Free}
          preventScrolling
          zIndexMode="manual"
          // Lecture seule.
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          // Le double-clic ouvre le node, comme sur le canvas.
          zoomOnDoubleClick={false}
          // Indispensable au double-clic : un node ni sélectionnable ni
          // draggable, et sans handler de clic, est rendu en
          // `pointer-events: none` par React Flow (`NodeWrapper`). Le
          // double-clic n'atteignait alors jamais le node.
          onNodeClick={keepNodesInteractive}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color={palette.hex}
          />
        </ReactFlow>
      </div>
    </ReactFlowProvider>
  );
}

/**
 * Un enfant de la frame, détaché d'elle : la frame n'existe pas dans cette
 * vue, et ses positions relatives deviennent des positions tout court.
 *
 * Le masquage posé par une frame compacte (`hiddenByFrame`) tombe — c'est ce
 * contenu-là qu'on vient voir. Un masquage propre au node, lui, reste.
 */
function toStandaloneNode(node: Node): Node {
  const { hiddenByFrame, ...data } = node.data ?? {};
  return {
    ...node,
    parentId: undefined,
    extent: undefined,
    expandParent: undefined,
    selected: false,
    dragging: false,
    hidden: hiddenByFrame === true ? false : node.hidden,
    data,
  };
}

function keepNodesInteractive() {}

function toReadOnlyEdge(edge: Edge): Edge {
  return { ...edge, selected: false, selectable: false };
}
