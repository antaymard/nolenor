import type { IconType } from "react-icons";
import {
  TbAbc,
  TbAlignLeft,
  TbCalendar,
  TbCheckbox,
  TbFileSearch,
  TbLink,
  TbNumber123,
  TbSelect,
} from "react-icons/tb";

export type ColumnType =
  | "text"
  | "richtext"
  | "number"
  | "checkbox"
  | "date"
  | "link"
  | "node"
  | "select";

/**
 * Hauteur des lignes de la grille. Le contenu d'une cellule n'est plus coupé à
 * une ligne par défaut : `short` reproduit l'ancien comportement (ellipse sur
 * une ligne), les deux autres laissent le texte revenir à la ligne.
 */
export type RowHeight = "short" | "medium" | "tall";

/** Agrégat affiché sous une colonne. `undefined` = aucun. */
export type SummaryKind =
  | "countAll"
  | "countEmpty"
  | "countFilled"
  | "countUnique"
  | "percentEmpty"
  | "percentFilled"
  | "sum"
  | "average"
  | "median"
  | "min"
  | "max"
  | "checked"
  | "unchecked"
  | "percentChecked";

export interface LinkCellValue {
  href: string;
  pageTitle: string;
  pageImage?: string;
  pageDescription?: string;
}

export interface NodeCellValue {
  nodeId: string;
}

export type SelectColor =
  | "gray"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "lime"
  | "green"
  | "emerald"
  | "teal"
  | "cyan"
  | "sky"
  | "blue"
  | "indigo"
  | "violet"
  | "purple"
  | "fuchsia"
  | "pink"
  | "rose";

export interface SelectOption {
  id: string;
  label: string;
  color: SelectColor;
}

export type SelectCellValue = string[];

export type CellValue =
  | string
  | number
  | boolean
  | LinkCellValue
  | NodeCellValue
  | SelectCellValue
  | null;

export interface TableColumn {
  id: string;
  name: string;
  type: ColumnType;
  width?: number;
  options?: SelectOption[];
  isMulti?: boolean;
  /** Agrégat affiché en pied de colonne. Persisté avec la table. */
  summary?: SummaryKind;
}

export interface TableRowData {
  id: string;
  cells: Record<string, CellValue>;
}

export interface TableData {
  columns: TableColumn[];
  rows: TableRowData[];
  /** Défaut `short`, pour que les tables existantes gardent leur densité. */
  rowHeight?: RowHeight;
}

export const COLUMN_TYPE_CONFIG: Record<
  ColumnType,
  { label: string; icon: IconType; hint: string }
> = {
  text: { label: "Text", icon: TbAbc, hint: "Plain text, multi-line" },
  richtext: {
    label: "Rich text",
    icon: TbAlignLeft,
    hint: "Bold, lists, paragraphs",
  },
  number: { label: "Number", icon: TbNumber123, hint: "Numeric values" },
  checkbox: { label: "Checkbox", icon: TbCheckbox, hint: "True or false" },
  select: { label: "Select", icon: TbSelect, hint: "Coloured options" },
  date: { label: "Date", icon: TbCalendar, hint: "A calendar day" },
  link: { label: "Link", icon: TbLink, hint: "A URL with its title" },
  node: { label: "Node", icon: TbFileSearch, hint: "A node of this canvas" },
};

/**
 * Classes de clamp par hauteur de ligne.
 *
 * `line-clamp` pour le texte, `maxHeight` pour le rich text : le contenu y est
 * un arbre de blocs, couper à N lignes de texte n'aurait pas de sens sur une
 * liste ou un tableau (même raison que dans les vues de champ rich_text).
 */
export const ROW_HEIGHT_CONFIG: Record<
  RowHeight,
  { label: string; lines: number; clamp: string }
> = {
  short: { label: "Short", lines: 1, clamp: "truncate" },
  medium: {
    label: "Medium",
    lines: 3,
    clamp: "line-clamp-3 whitespace-pre-wrap break-words",
  },
  tall: {
    label: "Tall",
    lines: 6,
    clamp: "line-clamp-6 whitespace-pre-wrap break-words",
  },
};

export const DEFAULT_ROW_HEIGHT: RowHeight = "short";

export const COLUMN_TYPE_LABELS: Record<ColumnType, string> =
  Object.fromEntries(
    columnTypeEntries().map(([type, config]) => [type, config.label]),
  ) as Record<ColumnType, string>;

/**
 * `Object.entries` typé sur `COLUMN_TYPE_CONFIG`. Les trois menus qui listent
 * les types (ajout de colonne, changement de type, import CSV) refaisaient
 * chacun la même assertion à la main.
 */
export function columnTypeEntries(): [
  ColumnType,
  (typeof COLUMN_TYPE_CONFIG)[ColumnType],
][] {
  return Object.entries(COLUMN_TYPE_CONFIG) as [
    ColumnType,
    (typeof COLUMN_TYPE_CONFIG)[ColumnType],
  ][];
}

export const SELECT_COLOR_PALETTE: SelectColor[] = [
  "gray",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
];

export const SELECT_COLOR_CLASSES: Record<
  SelectColor,
  { bg: string; text: string; ring: string; swatch: string }
> = {
  gray: {
    bg: "bg-gray-200 dark:bg-gray-700/60",
    text: "text-gray-800 dark:text-gray-100",
    ring: "ring-gray-400",
    swatch: "bg-gray-400",
  },
  red: {
    bg: "bg-red-200 dark:bg-red-900/50",
    text: "text-red-900 dark:text-red-100",
    ring: "ring-red-400",
    swatch: "bg-red-500",
  },
  orange: {
    bg: "bg-orange-200 dark:bg-orange-900/50",
    text: "text-orange-900 dark:text-orange-100",
    ring: "ring-orange-400",
    swatch: "bg-orange-500",
  },
  amber: {
    bg: "bg-amber-200 dark:bg-amber-900/50",
    text: "text-amber-900 dark:text-amber-100",
    ring: "ring-amber-400",
    swatch: "bg-amber-500",
  },
  yellow: {
    bg: "bg-yellow-200 dark:bg-yellow-900/50",
    text: "text-yellow-900 dark:text-yellow-100",
    ring: "ring-yellow-400",
    swatch: "bg-yellow-400",
  },
  lime: {
    bg: "bg-lime-200 dark:bg-lime-900/50",
    text: "text-lime-900 dark:text-lime-100",
    ring: "ring-lime-400",
    swatch: "bg-lime-500",
  },
  green: {
    bg: "bg-green-200 dark:bg-green-900/50",
    text: "text-green-900 dark:text-green-100",
    ring: "ring-green-400",
    swatch: "bg-green-500",
  },
  emerald: {
    bg: "bg-emerald-200 dark:bg-emerald-900/50",
    text: "text-emerald-900 dark:text-emerald-100",
    ring: "ring-emerald-400",
    swatch: "bg-emerald-500",
  },
  teal: {
    bg: "bg-teal-200 dark:bg-teal-900/50",
    text: "text-teal-900 dark:text-teal-100",
    ring: "ring-teal-400",
    swatch: "bg-teal-500",
  },
  cyan: {
    bg: "bg-cyan-200 dark:bg-cyan-900/50",
    text: "text-cyan-900 dark:text-cyan-100",
    ring: "ring-cyan-400",
    swatch: "bg-cyan-500",
  },
  sky: {
    bg: "bg-sky-200 dark:bg-sky-900/50",
    text: "text-sky-900 dark:text-sky-100",
    ring: "ring-sky-400",
    swatch: "bg-sky-500",
  },
  blue: {
    bg: "bg-blue-200 dark:bg-blue-900/50",
    text: "text-blue-900 dark:text-blue-100",
    ring: "ring-blue-400",
    swatch: "bg-blue-500",
  },
  indigo: {
    bg: "bg-indigo-200 dark:bg-indigo-900/50",
    text: "text-indigo-900 dark:text-indigo-100",
    ring: "ring-indigo-400",
    swatch: "bg-indigo-500",
  },
  violet: {
    bg: "bg-violet-200 dark:bg-violet-900/50",
    text: "text-violet-900 dark:text-violet-100",
    ring: "ring-violet-400",
    swatch: "bg-violet-500",
  },
  purple: {
    bg: "bg-purple-200 dark:bg-purple-900/50",
    text: "text-purple-900 dark:text-purple-100",
    ring: "ring-purple-400",
    swatch: "bg-purple-500",
  },
  fuchsia: {
    bg: "bg-fuchsia-200 dark:bg-fuchsia-900/50",
    text: "text-fuchsia-900 dark:text-fuchsia-100",
    ring: "ring-fuchsia-400",
    swatch: "bg-fuchsia-500",
  },
  pink: {
    bg: "bg-pink-200 dark:bg-pink-900/50",
    text: "text-pink-900 dark:text-pink-100",
    ring: "ring-pink-400",
    swatch: "bg-pink-500",
  },
  rose: {
    bg: "bg-rose-200 dark:bg-rose-900/50",
    text: "text-rose-900 dark:text-rose-100",
    ring: "ring-rose-400",
    swatch: "bg-rose-500",
  },
};
