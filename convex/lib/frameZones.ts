/**
 * Les zones d'une frame : une grille de colonnes (et de lignes, en option)
 * qui donne un sens à la position de son contenu.
 *
 * Kanban = des colonnes seules, matrice 2×2 = deux colonnes et deux lignes,
 * planning = sept colonnes et quelques lignes. La zone d'un node n'est
 * stockée nulle part : elle se lit sur sa position, que la frame range à
 * chaque dépôt (cf. `arrangeInZones`). Une seule source de vérité, et rien à
 * resynchroniser quand quelqu'un — ou Nolë — déplace un node.
 *
 * Fonctions pures en coordonnées de la frame (celles de ses enfants),
 * partagées par le canvas (rangement au dépôt, rendu de la grille) et par le
 * backend (la zone de chaque enfant dans `nole read`).
 */

export type FrameZones = {
  /** Au moins une colonne : une grille sans colonne n'a pas de zone. */
  columns: string[];
  /** Vide = une seule bande, sans en-tête de ligne (un Kanban). */
  rows: string[];
};

/** Une zone, par ses indices dans la grille. */
export type Zone = { column: number; row: number };

type XY = { x: number; y: number };
type Size = { width: number; height: number };
export type ZoneRect = { id: string } & XY & Size;

export const FRAME_ZONE_PRESETS = {
  columns: { columns: ["To do", "In progress", "Done"], rows: [] },
  matrix: {
    columns: ["Urgent", "Not urgent"],
    rows: ["Important", "Not important"],
  },
} satisfies Record<string, FrameZones>;

/**
 * Une timeline, c'est une frame en colonnes dont les colonnes sont des mois
 * qui se suivent. Rien ne la distingue dans les values : elle se reconnaît à
 * ses titres. En renommer un en fait de nouveau de simples colonnes — et c'est
 * juste, ce n'est plus une suite de mois.
 *
 * Titres toujours en anglais (« Oct 2026 ») : ils sont stockés, donc lus par
 * tous les collaborateurs et par Nolë, quelle que soit leur langue.
 */
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const TIMELINE_LENGTH = 6;

/** Un mois en index absolu (année × 12 + mois), et retour. */
const monthLabel = (index: number) =>
  `${MONTHS[index % 12]} ${Math.floor(index / 12)}`;
function monthIndex(label: string): number | null {
  const match = /^([A-Z][a-z]{2}) (\d{4})$/.exec(label);
  const month = match ? MONTHS.indexOf(match[1]) : -1;
  return match && month >= 0 ? Number(match[2]) * 12 + month : null;
}

/** Six mois glissants à partir de celui de `from`. */
export function timelineColumns(from: Date): string[] {
  const start = from.getFullYear() * 12 + from.getMonth();
  return Array.from({ length: TIMELINE_LENGTH }, (_, i) =>
    monthLabel(start + i),
  );
}

export function isTimeline(zones: FrameZones): boolean {
  const indices = zones.columns.map(monthIndex);
  return indices.every(
    (index, i) => index !== null && (i === 0 || index === indices[i - 1]! + 1),
  );
}

/** Le titre d'une colonne ajoutée : le mois suivant sur une timeline. */
export function nextColumnLabel(zones: FrameZones): string {
  if (isTimeline(zones)) {
    return monthLabel(monthIndex(zones.columns[zones.columns.length - 1])! + 1);
  }
  return `Column ${zones.columns.length + 1}`;
}

/** La bande des titres de colonne, en haut de la frame. */
export const ZONE_HEADER_HEIGHT = 44;
/** La bande des titres de ligne, à gauche — seulement quand il y a des lignes. */
export const ZONE_ROW_HEADER_WIDTH = 120;
/** Entre le bord d'une zone et les nodes qu'elle range. */
const ZONE_PADDING = 16;
/** Entre deux nodes empilés dans une zone. */
const ZONE_GAP = 12;

/** `null` pour une frame libre, ou une valeur stockée qui n'a pas la forme. */
export function readFrameZones(value: unknown): FrameZones | null {
  if (!value || typeof value !== "object") return null;
  const { columns, rows } = value as Record<string, unknown>;
  const isLabels = (labels: unknown): labels is string[] =>
    Array.isArray(labels) && labels.every((label) => typeof label === "string");
  if (!isLabels(columns) || columns.length === 0) return null;
  return { columns, rows: isLabels(rows) ? rows : [] };
}

/** Le découpage de la frame : bandes d'en-tête, puis cellules égales. */
export function zoneGrid(zones: FrameZones, size: Size) {
  const left = zones.rows.length > 0 ? ZONE_ROW_HEADER_WIDTH : 0;
  const top = ZONE_HEADER_HEIGHT;
  const rowCount = Math.max(1, zones.rows.length);
  return {
    left,
    top,
    rowCount,
    columnWidth: Math.max(0, size.width - left) / zones.columns.length,
    rowHeight: Math.max(0, size.height - top) / rowCount,
  };
}

/**
 * La zone d'un node : celle qui contient son centre.
 *
 * Bornée à la grille : un node posé sur une bande d'en-tête, ou débordant de
 * la frame, appartient à la zone la plus proche — tout enfant a une zone.
 */
export function zoneOf(zones: FrameZones, size: Size, rect: XY & Size): Zone {
  const grid = zoneGrid(zones, size);
  const clamp = (value: number, count: number) =>
    Math.min(count - 1, Math.max(0, Math.floor(value)));
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  return {
    column: clamp(
      grid.columnWidth > 0 ? (centerX - grid.left) / grid.columnWidth : 0,
      zones.columns.length,
    ),
    row: clamp(
      grid.rowHeight > 0 ? (centerY - grid.top) / grid.rowHeight : 0,
      grid.rowCount,
    ),
  };
}

/** Le nom lisible d'une zone : « Doing », ou « Urgent / Important ». */
export function zoneLabel(zones: FrameZones, zone: Zone): string {
  const column = zones.columns[zone.column] || `Column ${zone.column + 1}`;
  if (zones.rows.length === 0) return column;
  const row = zones.rows[zone.row] || `Row ${zone.row + 1}`;
  return `${column} / ${row}`;
}

/**
 * Range chaque node dans sa zone : empilés du haut vers le bas, alignés sur
 * le bord gauche de la colonne, dans l'ordre vertical où ils étaient — c'est
 * ce qui fait qu'un node lâché entre deux autres s'insère entre eux.
 *
 * La frame grandit (jamais ne rétrécit) pour que tout tienne : colonnes au
 * moins aussi larges que leur node le plus large, lignes au moins aussi
 * hautes que leur pile la plus haute. Toutes les colonnes gardent la même
 * largeur, toutes les lignes la même hauteur — la grille reste une grille.
 */
export function arrangeInZones({
  zones,
  size,
  children,
}: {
  zones: FrameZones;
  size: Size;
  children: Array<ZoneRect & { zone: Zone }>;
}): { positions: Map<string, XY>; size: Size } {
  const grid = zoneGrid(zones, size);

  // Bornée à la grille : une zone qui n'existe plus (colonne retirée) range
  // ses nodes dans la dernière qui existe.
  const byZone = new Map<string, typeof children>();
  for (const child of children) {
    const zone = {
      column: Math.min(child.zone.column, zones.columns.length - 1),
      row: Math.min(child.zone.row, grid.rowCount - 1),
    };
    const key = `${zone.column}:${zone.row}`;
    const placed = { ...child, zone };
    const group = byZone.get(key);
    if (group) group.push(placed);
    else byZone.set(key, [placed]);
  }

  let columnWidth = grid.columnWidth;
  let rowHeight = grid.rowHeight;
  for (const group of byZone.values()) {
    group.sort(
      (a, b) => a.y + a.height / 2 - (b.y + b.height / 2) || a.x - b.x,
    );
    const widest = Math.max(...group.map((child) => child.width));
    const stack =
      group.reduce((sum, child) => sum + child.height, 0) +
      ZONE_GAP * (group.length - 1);
    columnWidth = Math.max(columnWidth, widest + 2 * ZONE_PADDING);
    rowHeight = Math.max(rowHeight, stack + 2 * ZONE_PADDING);
  }

  const positions = new Map<string, XY>();
  for (const group of byZone.values()) {
    const { column, row } = group[0].zone;
    const x = grid.left + column * columnWidth + ZONE_PADDING;
    let y = grid.top + row * rowHeight + ZONE_PADDING;
    for (const child of group) {
      positions.set(child.id, { x, y });
      y += child.height + ZONE_GAP;
    }
  }

  return {
    positions,
    size: {
      width: Math.max(
        size.width,
        grid.left + zones.columns.length * columnWidth,
      ),
      height: Math.max(size.height, grid.top + grid.rowCount * rowHeight),
    },
  };
}
