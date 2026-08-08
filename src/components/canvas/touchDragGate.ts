import type { Node } from "@xyflow/react";

/**
 * Sur une surface tactile, un node ne devient draggable qu'une fois sélectionné :
 * le drag sur un node non sélectionné n'a pas de handler et retombe donc sur le
 * pane de zoom, qui pan.
 *
 * On n'émet jamais `draggable: false` : `fromXyNodeToCanvasNode` mappe cette
 * valeur vers `locked: true` en base, et on persisterait tous les nodes comme
 * verrouillés. Seuls `true` et `undefined` sortent d'ici.
 *
 * Le retrait de l'octroi périmé (dernière branche) n'est pas défensif :
 * `useCreateNode` et `useGoToNode` passent par `useReactFlow().setNodes`, qui
 * repasse par `onNodesChange` sous forme de changements `replace` — ce sont donc
 * les objets *dérivés* qui sont réécrits dans l'état de `useNodesState`.
 */
export function withTouchDragGate(nodes: Node[]): Node[] {
  return nodes.map((node) => {
    // Node verrouillé (locked en base) : il le reste, même sélectionné.
    if (node.draggable === false) return node;
    if (node.selected) {
      return node.draggable === true ? node : { ...node, draggable: true };
    }
    return node.draggable === true ? { ...node, draggable: undefined } : node;
  });
}
