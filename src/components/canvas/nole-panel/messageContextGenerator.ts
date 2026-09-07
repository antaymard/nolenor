import type { CanvasNode } from "@/types";
import { isNodeTypeReadableByAgent } from "@/../convex/config/nodeConfig";

type ViewportState = {
  x: number;
  y: number;
  zoom: number;
};

type ViewportBounds = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type MessageContextParams = {
  nodes: CanvasNode[];
  openedNodeIds: string[];
  attachedNodes: CanvasNode[];
  attachedPosition: { x: number; y: number } | null;
  viewport: ViewportState;
  viewportWidth: number;
  viewportHeight: number;
  getNodeTitle: (node: CanvasNode) => string;
  time?: Date;
};

export type MessageContextNodeSummary = {
  id: string;
  type: string;
  title: string;
  position: {
    x: number;
    y: number;
  };
  size: {
    width: number;
    height: number;
  };
};

export type MessageContextPayload = {
  generatedAt: string;
  openNodes: MessageContextNodeSummary[];
  viewport: {
    bounds: ViewportBounds;
    size: {
      width: number;
      height: number;
    };
    zoom: number;
    visibleNodes: { id: string; type: string; title: string }[];
  };
  attachedPosition: { x: number; y: number } | null;
  attachedNodes: MessageContextNodeSummary[];
};

function nodeToMessageContextNodeSummary(
  node: CanvasNode,
  getNodeTitle: (node: CanvasNode) => string,
): MessageContextNodeSummary {
  const width = Math.max(1, node.width ?? 200);
  const height = Math.max(1, node.height ?? 100);

  return {
    id: node.id,
    type: node.type,
    title: getNodeTitle(node),
    position: {
      x: Math.round(node.position.x),
      y: Math.round(node.position.y),
    },
    size: {
      width: Math.round(width),
      height: Math.round(height),
    },
  };
}

function formatTimeNaturalLanguage(time: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(time);
}

function getViewportBounds(
  viewport: ViewportState,
  viewportWidth: number,
  viewportHeight: number,
): ViewportBounds {
  const x1 = -viewport.x / viewport.zoom;
  const y1 = -viewport.y / viewport.zoom;
  const x2 = (viewportWidth - viewport.x) / viewport.zoom;
  const y2 = (viewportHeight - viewport.y) / viewport.zoom;

  return { x1, y1, x2, y2 };
}

function isNodeVisibleInBounds(
  node: CanvasNode,
  bounds: ViewportBounds,
): boolean {
  const nodeWidth = Math.max(1, node.width ?? 200);
  const nodeHeight = Math.max(1, node.height ?? 100);
  const nodeX1 = node.position.x;
  const nodeY1 = node.position.y;
  const nodeX2 = nodeX1 + nodeWidth;
  const nodeY2 = nodeY1 + nodeHeight;

  return !(
    nodeX2 < bounds.x1 ||
    nodeX1 > bounds.x2 ||
    nodeY2 < bounds.y1 ||
    nodeY1 > bounds.y2
  );
}

function dedupeNodes(nodes: CanvasNode[]): CanvasNode[] {
  const seen = new Set<string>();
  const result: CanvasNode[] = [];

  for (const node of nodes) {
    if (!seen.has(node.id)) {
      seen.add(node.id);
      result.push(node);
    }
  }

  return result;
}

export function generateMessageContext({
  nodes: allNodes,
  openedNodeIds,
  attachedNodes: allAttachedNodes,
  attachedPosition,
  viewport,
  viewportWidth,
  viewportHeight,
  getNodeTitle,
  time = new Date(),
}: MessageContextParams): MessageContextPayload {
  // Les types invisibles pour l'agent sortent en amont de toute dérivation :
  // ni nodes ouverts, ni nodes visibles dans le viewport, ni attachements. Ce
  // contexte part à chaque message hors de tout tool — sans ce filtre, l'agent
  // verrait passer des nodes sur lesquels aucun de ses tools ne répond.
  const isReadable = (node: CanvasNode) => isNodeTypeReadableByAgent(node.type);
  const nodes = allNodes.filter(isReadable);
  const attachedNodes = allAttachedNodes.filter(isReadable);

  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const openedNodes = dedupeNodes(
    openedNodeIds
      .map((nodeId) => nodesById.get(nodeId))
      .filter((node): node is CanvasNode => Boolean(node)),
  );
  const viewportBounds = getViewportBounds(
    viewport,
    viewportWidth,
    viewportHeight,
  );
  const visibleNodes = dedupeNodes(
    nodes.filter((node) => isNodeVisibleInBounds(node, viewportBounds)),
  );
  const uniqueAttachedNodes = dedupeNodes(attachedNodes);

  return {
    generatedAt: formatTimeNaturalLanguage(time),
    openNodes: openedNodes.map((node) =>
      nodeToMessageContextNodeSummary(node, getNodeTitle),
    ),
    viewport: {
      bounds: {
        x1: Math.round(viewportBounds.x1),
        y1: Math.round(viewportBounds.y1),
        x2: Math.round(viewportBounds.x2),
        y2: Math.round(viewportBounds.y2),
      },
      size: {
        width: Math.round(viewportWidth),
        height: Math.round(viewportHeight),
      },
      zoom: viewport.zoom,
      visibleNodes: visibleNodes.map((node) => ({
        id: node.id,
        type: node.type,
        title: getNodeTitle(node),
      })),
    },
    attachedPosition: attachedPosition
      ? {
          x: Math.round(attachedPosition.x),
          y: Math.round(attachedPosition.y),
        }
      : null,
    attachedNodes: uniqueAttachedNodes.map((node) =>
      nodeToMessageContextNodeSummary(node, getNodeTitle),
    ),
  };
}
