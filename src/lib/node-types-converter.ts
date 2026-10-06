import type { CanvasNode } from "@/types/convex";
import type { colorsEnum } from "@/types/domain";
import type { CoordinateExtent, Node } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import type { NodeDisplayOptions } from "@/../convex/schemas/nodesSchema";
import { FRAME_COMPACT_SIZE, isCompactFrame } from "@/lib/frameVariant";

export function fromXyNodeToCanvasNode(xyNode: Node): CanvasNode {
  // `displayOptions` est extrait comme `color` et `variant` : laissé dans
  // `restData`, il repartirait dans le sac `data` au lieu de son champ.
  // `hiddenByFrame` est dérivé au rendu (cf. `fromCanvasNodesToXyNodes`) :
  // il ne repart ni dans `data`, ni en `hidden` — ce dernier ne dit que le
  // masquage propre au node.
  const {
    nodeDataId,
    color,
    variant,
    displayOptions,
    hiddenByFrame,
    ...restData
  } = (xyNode.data ?? {}) as {
    nodeDataId?: Id<"nodeDatas">;
    color?: colorsEnum;
    variant?: string;
    displayOptions?: NodeDisplayOptions;
    hiddenByFrame?: boolean;
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
    ...(xyNode.hidden === true && hiddenByFrame !== true && { hidden: true }),
    ...(xyNode.zIndex != null && { zIndex: xyNode.zIndex }),
    ...(color && { color }),
    ...(variant && { variant }),
    ...(displayOptions && { displayOptions }),
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
      ...(canvasNode.displayOptions && {
        displayOptions: canvasNode.displayOptions,
      }),
      ...restData,
    },
    ...(canvasNode.parentId && { parentId: canvasNode.parentId }),
    ...(extent && { extent }),
    ...(canvasNode.extendParent && { expandParent: canvasNode.extendParent }),
  };
}

/**
 * React Flow exige qu'un parent précède ses enfants dans le tableau `nodes` :
 * un enfant rencontré avant son parent est rendu à des coordonnées absolues,
 * donc décalé du parent tant que rien ne le re-trie.
 *
 * Tri stable en deux passes et non tri topologique général : il n'existe pas
 * de frame dans une frame, la hiérarchie n'a donc qu'un seul niveau. L'ordre
 * relatif à l'intérieur de chaque groupe est préservé — c'est lui qui
 * départage les `zIndex` égaux (cf. `toPaintOrder` dans `nodeLayering`).
 */
export function fromCanvasNodesToXyNodes(canvasNodes: CanvasNode[]): Node[] {
  const parentsFirst = [
    ...canvasNodes.filter((node) => !node.parentId),
    ...canvasNodes.filter((node) => node.parentId),
  ];
  const compactFrameIds = new Set(
    canvasNodes.filter(isCompactFrame).map((node) => node.id),
  );
  if (compactFrameIds.size === 0) {
    return parentsFirst.map(fromCanvasNodeToXyNode);
  }
  return parentsFirst.map((canvasNode) => {
    const xyNode = fromCanvasNodeToXyNode(canvasNode);
    if (compactFrameIds.has(canvasNode.id)) return withCompactFrameSize(xyNode);
    if (canvasNode.parentId && compactFrameIds.has(canvasNode.parentId)) {
      return {
        ...xyNode,
        hidden: true,
        data: { ...xyNode.data, hiddenByFrame: true },
      };
    }
    return xyNode;
  });
}

/**
 * Une frame compacte se rend à la taille de sa carte, sa taille stockée
 * restant celle de la frame dépliée (cf. `src/lib/frameVariant.ts`). `measured`
 * suit, sinon React Flow garderait l'ancienne boîte pour la sélection et les
 * edges jusqu'à la prochaine mesure.
 *
 * Elle se peint aussi comme un node ordinaire, au-dessus des edges : une frame
 * compactée avant que la variante ne fasse changer de bande (ou par l'agent)
 * garde son `zIndex` négatif de frame dépliée, ramené ici dans la bande des
 * nodes (cf. `nodeLayering`).
 */
function withCompactFrameSize(xyNode: Node): Node {
  return {
    ...xyNode,
    ...((xyNode.zIndex ?? 0) < 0 && { zIndex: 0 }),
    width: FRAME_COMPACT_SIZE.width,
    height: FRAME_COMPACT_SIZE.height,
    measured: { ...FRAME_COMPACT_SIZE },
  };
}
