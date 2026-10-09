/**
 * Alignement et distribution d'une sélection, « à la Figma ».
 *
 * Fonctions pures sur des rectangles en coordonnées monde : le hook
 * (`useArrangeNodes`) lit les rectangles sur le canvas et réécrit les
 * positions. Tout se fait par rapport à la boîte englobante de la sélection,
 * comme dans Figma : « aligner à gauche » ramène tout au bord gauche du node
 * le plus à gauche.
 */

export type ArrangeRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AlignCommand =
  | "left"
  | "hcenter"
  | "right"
  | "top"
  | "vcenter"
  | "bottom";

export type ArrangeCommand =
  | AlignCommand
  | "distributeH"
  | "distributeV"
  | "tidy";

/**
 * La forme de la sélection : une rangée, une colonne, une grille régulière,
 * ou rien de tout ça. Décide des actions qu'on met en avant.
 */
export type SelectionLayout = "row" | "column" | "grid" | "scattered";

type XY = { x: number; y: number };

/** L'écart de « Tidy up » quand la sélection n'en a aucun à imiter. */
const DEFAULT_TIDY_GAP = 40;

/** Sous ce seuil (unités monde), un déplacement n'en est pas un. */
const EPSILON = 0.5;

/** Combien de nodes chaque commande demande pour avoir un sens. */
export function minNodesFor(command: ArrangeCommand): number {
  return command === "distributeH" || command === "distributeV" ? 3 : 2;
}

function bounds(rects: ArrangeRect[]) {
  const left = Math.min(...rects.map((r) => r.x));
  const top = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.width));
  const bottom = Math.max(...rects.map((r) => r.y + r.height));
  return { left, top, right, bottom };
}

function align(rects: ArrangeRect[], command: AlignCommand): Map<string, XY> {
  const b = bounds(rects);
  const result = new Map<string, XY>();
  for (const r of rects) {
    let { x, y } = r;
    switch (command) {
      case "left":
        x = b.left;
        break;
      case "hcenter":
        x = (b.left + b.right) / 2 - r.width / 2;
        break;
      case "right":
        x = b.right - r.width;
        break;
      case "top":
        y = b.top;
        break;
      case "vcenter":
        y = (b.top + b.bottom) / 2 - r.height / 2;
        break;
      case "bottom":
        y = b.bottom - r.height;
        break;
    }
    result.set(r.id, { x, y });
  }
  return result;
}

/**
 * Écarts égaux entre voisins sur un axe. Les deux extrêmes ne bougent pas :
 * seuls ceux du milieu se répartissent entre eux, comme dans Figma. Un écart
 * négatif (nodes qui se chevauchent faute de place) est conservé tel quel.
 */
function distribute(rects: ArrangeRect[], axis: "x" | "y"): Map<string, XY> {
  const size = (r: ArrangeRect) => (axis === "x" ? r.width : r.height);
  const start = (r: ArrangeRect) => (axis === "x" ? r.x : r.y);
  const sorted = [...rects].sort(
    (a, b) => start(a) + size(a) / 2 - (start(b) + size(b) / 2),
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const span = start(last) + size(last) - start(first);
  const occupied = sorted.reduce((sum, r) => sum + size(r), 0);
  const gap = (span - occupied) / (sorted.length - 1);

  const result = new Map<string, XY>();
  let cursor = start(first);
  for (const r of sorted) {
    result.set(r.id, axis === "x" ? { x: cursor, y: r.y } : { x: r.x, y: cursor });
    cursor += size(r) + gap;
  }
  // Les extrêmes restent exactement où ils étaient (pas d'arrondi qui dérive).
  result.set(first.id, { x: first.x, y: first.y });
  result.set(last.id, { x: last.x, y: last.y });
  return result;
}

/**
 * Regroupe en bandes le long d'un axe : un rectangle rejoint la bande en
 * cours si son centre tombe dans l'étendue de celle-ci. `axis: "y"` donne
 * les rangées, `axis: "x"` les colonnes.
 */
function cluster(rects: ArrangeRect[], axis: "x" | "y"): ArrangeRect[][] {
  const start = (r: ArrangeRect) => (axis === "y" ? r.y : r.x);
  const size = (r: ArrangeRect) => (axis === "y" ? r.height : r.width);
  const center = (r: ArrangeRect) => start(r) + size(r) / 2;
  const sorted = [...rects].sort((a, b) => center(a) - center(b));

  const bands: { items: ArrangeRect[]; from: number; to: number }[] = [];
  for (const r of sorted) {
    const band = bands[bands.length - 1];
    if (band && center(r) >= band.from && center(r) <= band.to) {
      band.items.push(r);
      band.from = Math.min(band.from, start(r));
      band.to = Math.max(band.to, start(r) + size(r));
    } else {
      bands.push({ items: [r], from: start(r), to: start(r) + size(r) });
    }
  }
  // Chaque bande dans l'ordre de l'autre axe : les rangées de gauche à
  // droite, les colonnes de haut en bas.
  const cross = (r: ArrangeRect) => (axis === "y" ? r.x : r.y);
  return bands.map((band) => band.items.sort((a, b) => cross(a) - cross(b)));
}

/** Rangée, colonne, grille régulière… ou aucune structure lisible. */
export function detectLayout(rects: ArrangeRect[]): SelectionLayout {
  if (rects.length < 2) return "scattered";
  const rows = cluster(rects, "y");
  if (rows.length === 1) return "row";
  const columns = cluster(rects, "x");
  if (columns.length === 1) return "column";
  // Grille : autant de nodes dans chaque rangée qu'il y a de colonnes, et
  // chaque rangée en touche bien toutes.
  const columnOf = new Map<string, number>();
  columns.forEach((column, index) => {
    for (const r of column) columnOf.set(r.id, index);
  });
  const isGrid = rows.every(
    (row) =>
      row.length === columns.length &&
      row.every((r, index) => columnOf.get(r.id) === index),
  );
  return isGrid ? "grid" : "scattered";
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * « Tidy up » : remet une rangée, une colonne ou une grille au carré —
 * cellules alignées en haut à gauche, un seul écart horizontal et un seul
 * écart vertical, pris sur les écarts actuels (leur médiane, arrondie). Rien
 * si la sélection n'a pas de structure lisible : on ne devine pas une grille.
 */
function tidy(rects: ArrangeRect[]): Map<string, XY> {
  if (detectLayout(rects) === "scattered") return new Map();
  const rows = cluster(rects, "y");
  const columnCount = Math.max(...rows.map((row) => row.length));

  const gapsX: number[] = [];
  for (const row of rows) {
    for (let i = 1; i < row.length; i++) {
      gapsX.push(row[i].x - (row[i - 1].x + row[i - 1].width));
    }
  }
  const gapsY: number[] = [];
  for (let i = 1; i < rows.length; i++) {
    const previousBottom = Math.max(...rows[i - 1].map((r) => r.y + r.height));
    const top = Math.min(...rows[i].map((r) => r.y));
    gapsY.push(top - previousBottom);
  }
  const gapOf = (gaps: number[]) => {
    const value = median(gaps.filter((gap) => gap > 0));
    return value === null ? DEFAULT_TIDY_GAP : Math.round(value);
  };
  const gapX = gapOf(gapsX);
  const gapY = gapOf(gapsY);

  const columnWidths = Array.from({ length: columnCount }, (_, column) =>
    Math.max(0, ...rows.map((row) => row[column]?.width ?? 0)),
  );
  const rowHeights = rows.map((row) => Math.max(...row.map((r) => r.height)));

  const b = bounds(rects);
  const result = new Map<string, XY>();
  let y = b.top;
  rows.forEach((row, rowIndex) => {
    let x = b.left;
    row.forEach((r, column) => {
      result.set(r.id, { x, y });
      x += columnWidths[column] + gapX;
    });
    y += rowHeights[rowIndex] + gapY;
  });
  return result;
}

/**
 * Les nouvelles positions (coin haut-gauche, monde) des rectangles que la
 * commande déplace. Ceux qui ne bougent pas sont absents : une map vide veut
 * dire « déjà en place ».
 */
export function arrangeRects(
  rects: ArrangeRect[],
  command: ArrangeCommand,
): Map<string, XY> {
  if (rects.length < minNodesFor(command)) return new Map();

  let next: Map<string, XY>;
  switch (command) {
    case "distributeH":
      next = distribute(rects, "x");
      break;
    case "distributeV":
      next = distribute(rects, "y");
      break;
    case "tidy":
      next = tidy(rects);
      break;
    default:
      next = align(rects, command);
  }

  const byId = new Map(rects.map((r) => [r.id, r]));
  for (const [id, position] of next) {
    const r = byId.get(id)!;
    if (
      Math.abs(position.x - r.x) < EPSILON &&
      Math.abs(position.y - r.y) < EPSILON
    ) {
      next.delete(id);
    }
  }
  return next;
}

/**
 * Les commandes à mettre en avant pour cette forme de sélection — celles
 * qu'on cherche le plus souvent devant une rangée ou une colonne —, privées
 * de celles qui n'y changeraient rien.
 */
export function suggestedCommands(rects: ArrangeRect[]): ArrangeCommand[] {
  const layout = detectLayout(rects);
  const candidates: ArrangeCommand[] =
    layout === "row"
      ? ["top", "distributeH", "tidy"]
      : layout === "column"
        ? ["left", "distributeV", "tidy"]
        : layout === "grid"
          ? ["tidy"]
          : [];
  return candidates.filter(
    (command) =>
      // À deux, ranger une rangée revient à l'aligner : doublon.
      !(command === "tidy" && layout !== "grid" && rects.length < 3) &&
      arrangeRects(rects, command).size > 0,
  );
}
