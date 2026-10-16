/**
 * Le board côté DOM : ses espaces et les boîtes fantômes qu'ils contiennent
 * (une par node rangé, à sa taille) se repèrent par des attributs `data-*`.
 *
 * C'est le DOM qui fait la mise en page — une vraie flexbox — et ce module
 * qui la lit : où sont les fantômes (donc où poser les vrais nodes), et quel
 * espace est sous le curseur pendant un drag.
 */

export const BOARD_ATTR = "data-board-id";
export const SPACE_ATTR = "data-board-space";
export const GHOST_ATTR = "data-board-ghost";

type XY = { x: number; y: number };

/**
 * La position d'un élément dans `root`, en unités du canvas.
 *
 * Par `offsetLeft`/`offsetTop` et pas par `getBoundingClientRect` : ils
 * ignorent le zoom du viewport (une transformation CSS), il n'y a donc rien
 * à rediviser. On remonte la chaîne des `offsetParent` jusqu'à `root`, qui
 * doit être positionné. Les ancêtres positionnés en chemin ne doivent pas
 * avoir de bordure : `offsetLeft` se mesure depuis l'intérieur de celle de
 * son parent.
 */
export function offsetWithin(element: HTMLElement, root: HTMLElement): XY {
  let x = 0;
  let y = 0;
  let current: HTMLElement | null = element;
  while (current && current !== root) {
    x += current.offsetLeft;
    y += current.offsetTop;
    current = current.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

/**
 * L'espace d'un board sous un point de l'écran, et le rang d'insertion :
 * le nombre de nodes rangés (hors `excludedIds`, ceux qu'on porte) dont le
 * milieu est au-dessus du curseur.
 *
 * Le curseur hors de tout espace (une bande de marge) vise l'espace le plus
 * proche : au-dessus d'un board, on dépose toujours quelque part.
 */
export function findBoardDropTarget(
  boardId: string,
  client: XY,
  excludedIds: Set<string>,
): { spaceId: string; index: number } | null {
  const board = document.querySelector(
    `[${BOARD_ATTR}="${CSS.escape(boardId)}"]`,
  );
  if (!board) return null;

  let best: { element: Element; distance: number } | null = null;
  for (const element of board.querySelectorAll(`[${SPACE_ATTR}]`)) {
    const rect = element.getBoundingClientRect();
    const dx = Math.max(rect.left - client.x, 0, client.x - rect.right);
    const dy = Math.max(rect.top - client.y, 0, client.y - rect.bottom);
    const distance = Math.hypot(dx, dy);
    if (!best || distance < best.distance) best = { element, distance };
  }
  if (!best) return null;

  let index = 0;
  for (const ghost of best.element.querySelectorAll(`[${GHOST_ATTR}]`)) {
    if (excludedIds.has(ghost.getAttribute(GHOST_ATTR) ?? "")) continue;
    const rect = ghost.getBoundingClientRect();
    if (rect.top + rect.height / 2 < client.y) index++;
  }
  return { spaceId: best.element.getAttribute(SPACE_ATTR)!, index };
}
