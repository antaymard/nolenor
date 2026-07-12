import type { CanvasNode } from "@/types/convex";
import type { colorsEnum } from "@/types/domain";
import type { CoordinateExtent, Node } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";

export function fromXyNodeToCanvasNode(xyNode: Node): CanvasNode {
  const { nodeDataId, color, variant, ...restData } = (xyNode.data ?? {}) as {
    nodeDataId?: Id<"nodeDatas">;
    color?: colorsEnum;
    variant?: string;
    [key: string]: unknown;
  };

  return {
    id: xyNode.id,
    ...(nodeDataId && { nodeDataId }),
    type: (xyNode.type ?? "default") as CanvasNode["type"],
    position: xyNode.position,
    width: xyNode.measured?.width ?? xyNode.width ?? 0,
    height: xyNode.measured?.height ?? xyNode.height ?? 0,
    ...(xyNode.draggable === false && { locked: true }),
    ...(xyNode.hidden === true && { hidden: true }),
    ...(xyNode.zIndex != null && { zIndex: xyNode.zIndex }),
    ...(color && { color }),
    ...(variant && { variant }),
    ...(Object.keys(restData).length > 0 && { data: restData }),
    ...(xyNode.parentId && { parentId: xyNode.parentId }),
    ...(xyNode.extent && { extent: xyNode.extent as CanvasNode["extent"] }),
    ...(xyNode.expandParent && { extendParent: xyNode.expandParent }),
  };
}

export function fromXyNodesToCanvasNodes(xyNodes: Node[]): CanvasNode[] {
  return xyNodes.map(fromXyNodeToCanvasNode);
}

export function fromCanvasNodeToXyNode(canvasNode: CanvasNode): Node {
  const restData = canvasNode.data ?? {};
  const extent = canvasNode.extent as CoordinateExtent | "parent" | undefined;

  return {
    id: canvasNode.id,
    type: canvasNode.type,
    position: canvasNode.position,
    width: canvasNode.width,
    height: canvasNode.height,
    // Provide measured dimensions to prevent React Flow from re-measuring
    // nodes that already have known dimensions from the database
    ...(canvasNode.width > 0 &&
      canvasNode.height > 0 && {
        measured: {
          width: canvasNode.width,
          height: canvasNode.height,
        },
      }),
    ...(canvasNode.locked === true && { draggable: false }),
    ...(canvasNode.hidden === true && { hidden: true }),
    ...(canvasNode.zIndex != null && { zIndex: canvasNode.zIndex }),
    data: {
      ...(canvasNode.nodeDataId != null && {
        nodeDataId: canvasNode.nodeDataId,
      }),
      ...(canvasNode.color && { color: canvasNode.color }),
      ...(canvasNode.variant && { variant: canvasNode.variant }),
      ...restData,
    },
    ...(canvasNode.parentId && { parentId: canvasNode.parentId }),
    ...(extent && { extent }),
    ...(canvasNode.extendParent && { expandParent: canvasNode.extendParent }),
  };
}

export function fromCanvasNodesToXyNodes(canvasNodes: CanvasNode[]): Node[] {
  return canvasNodes.map(fromCanvasNodeToXyNode);
}
