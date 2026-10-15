/**
 * Les tailles minimales du redimensionnement en cours, déclarées par les nodes
 * qui posent leurs poignées (`NodeFrame`, `FrameNode`, `TitleNode`) et lues
 * par l'aimantation du resize (cf. `useNodeSnapping`) : un aimant ne doit pas
 * faire passer un node sous la borne que ses poignées lui imposent.
 *
 * Une par bord, comme chez `FrameNode` : tirer le bord gauche et tirer le bord
 * droit ne butent pas forcément sur la même chose.
 *
 * Pas d'état React, comme `setNodeResizable` : rien ne re-rend quand elles
 * changent, elles ne sont lues qu'au fil du geste.
 */
export type ResizeMinSize = {
  widthFromRight: number;
  widthFromLeft: number;
  heightFromBottom: number;
  heightFromTop: number;
};

const minSizes = new Map<string, ResizeMinSize>();

export function setResizeMinSize(
  nodeId: string,
  minSize: ResizeMinSize | null,
): void {
  if (minSize) minSizes.set(nodeId, minSize);
  else minSizes.delete(nodeId);
}

export function getResizeMinSize(nodeId: string): ResizeMinSize | undefined {
  return minSizes.get(nodeId);
}
