/**
 * Coordonnées d'un node, quand certains vivent dans une frame.
 *
 * Un node rattaché à une frame porte une `position` RELATIVE à elle : c'est la
 * convention de React Flow, et c'est ce qui fait qu'il la suit sans que
 * personne n'ait à propager le déplacement. Le revers est que `node.position`
 * n'est plus lisible seule — tout ce qui raisonne en coordonnées monde
 * (proximité, boîtes englobantes, filtres `area`/`near`, placement) doit
 * passer par ici.
 *
 * Générique sur la forme du node parce que les deux mondes ont la leur : le
 * DTO `CanvasNode` côté backend, le `Node` de React Flow côté front. La règle,
 * elle, est la même.
 *
 * Un seul niveau de résolution : il n'y a pas de frame dans une frame. Si ça
 * changeait, c'est cette fonction qui deviendrait récursive, et elle seule.
 */

export type PositionedNode = {
  id: string;
  position: { x: number; y: number };
  parentId?: string;
};

export function absolutePosition<T extends PositionedNode>(
  node: T,
  byId: Map<string, T>,
): { x: number; y: number } {
  if (!node.parentId) return node.position;
  const parent = byId.get(node.parentId);
  // Parent introuvable : on rend la position telle quelle plutôt que de
  // lever. Un `parentId` pendant est une incohérence, pas une raison de faire
  // échouer une lecture de canvas.
  if (!parent) return node.position;
  return {
    x: parent.position.x + node.position.x,
    y: parent.position.y + node.position.y,
  };
}

/** Les positions monde de tout un canvas, indexées par llmId. */
export function absolutePositionsById<T extends PositionedNode>(
  nodes: T[],
): Map<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return new Map(
    nodes.map((node) => [node.id, absolutePosition(node, byId)]),
  );
}
