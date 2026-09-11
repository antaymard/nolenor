import type { OptimisticLocalStore } from "convex/browser";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import type { CanvasNode } from "@/types/convex";

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

export function mergeFlowNodes(
  tableNodes: Doc<"nodes">[] | undefined,
  embeddedNodes: CanvasNode[] | undefined,
): CanvasNode[] | undefined {
  if (tableNodes === undefined) return embeddedNodes;
  const fromTable = tableNodes.map(toCanvasNode);
  const tableIds = new Set(fromTable.map((node) => node.id));
  const extras = (embeddedNodes ?? []).filter((node) => !tableIds.has(node.id));
  return [...fromTable, ...extras];
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
