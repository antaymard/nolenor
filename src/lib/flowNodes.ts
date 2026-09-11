import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import type { CanvasNode, Edge } from "@/types/convex";

export function toCanvasNode(doc: Doc<"nodes">): CanvasNode {
  return {
    id: doc.id,
    nodeDataId: doc.nodeDataId,
    type: doc.type,
    position: doc.position,
    width: doc.width,
    height: doc.height,
    ...(doc.locked !== undefined && { locked: doc.locked }),
    ...(doc.hidden !== undefined && { hidden: doc.hidden }),
    ...(doc.zIndex !== undefined && { zIndex: doc.zIndex }),
    ...(doc.color !== undefined && { color: doc.color }),
    ...(doc.variant !== undefined && { variant: doc.variant }),
    ...(doc.parentId !== undefined && { parentId: doc.parentId }),
    ...(doc.extent !== undefined && { extent: doc.extent }),
    ...(doc.extendParent !== undefined && { extendParent: doc.extendParent }),
    ...(doc.data !== undefined && { data: doc.data }),
  };
}

export function toCanvasEdge(doc: Doc<"edges">): Edge {
  return {
    id: doc.id,
    source: doc.source,
    target: doc.target,
    ...(doc.sourceHandle !== undefined && { sourceHandle: doc.sourceHandle }),
    ...(doc.targetHandle !== undefined && { targetHandle: doc.targetHandle }),
    ...(doc.markerEnd !== undefined && { markerEnd: doc.markerEnd }),
    ...(doc.data !== undefined && { data: doc.data }),
  };
}

type NodePatch = {
  nodeId: string;
  props: {
    position?: { x: number; y: number };
    width?: number;
    height?: number;
    locked?: boolean;
    hidden?: boolean;
    zIndex?: number;
    color?: string;
    variant?: string;
    parentId?: string;
    extent?: CanvasNode["extent"];
    extendParent?: boolean;
    data?: Record<string, unknown>;
  };
};

export function applyNodePatchesToListQuery(
  localStore: OptimisticLocalStore,
  canvasId: Id<"canvases">,
  updates: NodePatch[],
) {
  if (updates.length === 0) return;
  const existing = localStore.getQuery(api.nodes.listFromCanvas, { canvasId });
  if (existing === undefined) return;

  const byId = new Map(updates.map((update) => [update.nodeId, update.props]));
  localStore.setQuery(
    api.nodes.listFromCanvas,
    { canvasId },
    existing.map((node) => {
      const props = byId.get(node.id);
      if (!props) return node;
      return {
        ...node,
        ...(props.position !== undefined && { position: props.position }),
        ...(props.width !== undefined && { width: props.width }),
        ...(props.height !== undefined && { height: props.height }),
        ...(props.locked !== undefined && { locked: props.locked }),
        ...(props.hidden !== undefined && { hidden: props.hidden }),
        ...(props.zIndex !== undefined && { zIndex: props.zIndex }),
        ...(props.color !== undefined && { color: props.color }),
        ...(props.variant !== undefined && { variant: props.variant }),
        ...(props.parentId !== undefined && { parentId: props.parentId }),
        ...(props.extent !== undefined && { extent: props.extent }),
        ...(props.extendParent !== undefined && {
          extendParent: props.extendParent,
        }),
        ...(props.data !== undefined && {
          data: { ...(node.data ?? {}), ...props.data },
        }),
      };
    }),
  );
}

export function removeNodesFromListQuery(
  localStore: OptimisticLocalStore,
  canvasId: Id<"canvases">,
  nodeIds: string[],
) {
  if (nodeIds.length === 0) return;
  const existing = localStore.getQuery(api.nodes.listFromCanvas, { canvasId });
  if (existing === undefined) return;
  const removed = new Set(nodeIds);
  localStore.setQuery(
    api.nodes.listFromCanvas,
    { canvasId },
    existing.filter((node) => !removed.has(node.id)),
  );
}

type EdgeDataPatch = {
  id: string;
  data?: Record<string, unknown>;
};

/**
 * Optimistic des patchs `data` d'edges sur `edges.listFromCanvas` : fusion
 * shallow par edge (parité serveur `updateCanvasEdges`), pour éviter le
 * bounce Convex → ReactFlow pendant l'aller-retour mutation.
 */
export function applyEdgeDataPatchesToListQuery(
  localStore: OptimisticLocalStore,
  canvasId: Id<"canvases">,
  edgeUpdates: EdgeDataPatch[],
) {
  if (edgeUpdates.length === 0) return;
  const existing = localStore.getQuery(api.edges.listFromCanvas, { canvasId });
  if (existing === undefined) return;

  const byId = new Map(edgeUpdates.map((update) => [update.id, update.data]));
  localStore.setQuery(
    api.edges.listFromCanvas,
    { canvasId },
    existing.map((edge) => {
      const dataUpdate = byId.get(edge.id);
      if (dataUpdate === undefined) return edge;
      return { ...edge, data: { ...(edge.data ?? {}), ...dataUpdate } };
    }),
  );
}
