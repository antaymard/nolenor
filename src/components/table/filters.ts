import { richTextToPlainText } from "./richText";
import type {
  CellValue,
  ColumnType,
  LinkCellValue,
  NodeCellValue,
  SelectCellValue,
  TableColumn,
  TableRowData,
} from "./types";

/**
 * Filtres de colonne, façon Notion.
 *
 * Les conditions sont évaluées ici plutôt que via `columnFilters` de tanstack :
 * tanstack ne sait que ET-er ses filtres de colonne, et on veut aussi le OU
 * ("Any"). Les lignes sont donc filtrées en amont de `useReactTable`, qui garde
 * le tri et la recherche globale par-dessus.
 *
 * Volontairement NON persisté (comme le tri et la recherche) : regarder ses
 * données sous un filtre ne doit pas marquer la fenêtre comme modifiée.
 */

export type FilterOperator =
  | "is"
  | "isNot"
  | "contains"
  | "doesNotContain"
  | "isEmpty"
  | "isNotEmpty"
  | "eq"
  | "ne"
  | "gt"
  | "lt"
  | "gte"
  | "lte"
  | "isChecked"
  | "isUnchecked"
  | "isBefore"
  | "isAfter"
  | "isAnyOf"
  | "isNoneOf";

export type FilterConjunction = "all" | "any";

export interface TableFilter {
  id: string;
  columnId: string;
  operator: FilterOperator;
  /** Absent pour les opérateurs unaires (`isEmpty`, `isChecked`, …). */
  value?: string | string[];
}

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  is: "is",
  isNot: "is not",
  contains: "contains",
  doesNotContain: "does not contain",
  isEmpty: "is empty",
  isNotEmpty: "is not empty",
  eq: "=",
  ne: "≠",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
  isChecked: "is checked",
  isUnchecked: "is unchecked",
  isBefore: "is before",
  isAfter: "is after",
  isAnyOf: "is any of",
  isNoneOf: "is none of",
};

const TEXT_OPERATORS: FilterOperator[] = [
  "is",
  "isNot",
  "contains",
  "doesNotContain",
  "isEmpty",
  "isNotEmpty",
];

export const OPERATORS_BY_TYPE: Record<ColumnType, FilterOperator[]> = {
  text: TEXT_OPERATORS,
  richtext: TEXT_OPERATORS,
  number: ["eq", "ne", "gt", "lt", "gte", "lte", "isEmpty", "isNotEmpty"],
  checkbox: ["isChecked", "isUnchecked"],
  date: ["is", "isBefore", "isAfter", "isEmpty", "isNotEmpty"],
  select: ["isAnyOf", "isNoneOf", "isEmpty", "isNotEmpty"],
  link: ["contains", "doesNotContain", "isEmpty", "isNotEmpty"],
  node: ["contains", "doesNotContain", "isEmpty", "isNotEmpty"],
};

const UNARY_OPERATORS = new Set<FilterOperator>([
  "isEmpty",
  "isNotEmpty",
  "isChecked",
  "isUnchecked",
]);

export function operatorNeedsValue(operator: FilterOperator): boolean {
  return !UNARY_OPERATORS.has(operator);
}

export function defaultOperatorFor(type: ColumnType): FilterOperator {
  return OPERATORS_BY_TYPE[type][0];
}

/**
 * Texte comparable d'une cellule.
 *
 * Les cellules `node` n'exposent qu'un id : on ne peut pas en tirer un titre
 * sans le store des nodes, donc `contains` sur une colonne node porte sur l'id.
 * C'est cohérent avec ce que fait déjà la recherche globale.
 */
function cellText(value: CellValue, column: TableColumn): string {
  if (value == null) return "";

  switch (column.type) {
    case "richtext":
      return richTextToPlainText(value);
    case "link": {
      const link = value as LinkCellValue;
      return `${link.pageTitle ?? ""} ${link.href ?? ""}`.trim();
    }
    case "node":
      return (value as NodeCellValue).nodeId ?? "";
    case "select": {
      if (!Array.isArray(value)) return "";
      const byId = new Map((column.options ?? []).map((o) => [o.id, o.label]));
      return (value as SelectCellValue)
        .map((id) => byId.get(id) ?? "")
        .join(" ");
    }
    default:
      return String(value);
  }
}

function isEmptyCell(value: CellValue, column: TableColumn): boolean {
  if (value == null) return true;
  if (column.type === "checkbox") return false;
  if (Array.isArray(value)) return value.length === 0;
  return cellText(value, column).trim() === "";
}

function selectedIds(value: CellValue): string[] {
  if (Array.isArray(value)) return value as SelectCellValue;
  if (typeof value === "string" && value) return [value];
  return [];
}

export function matchesFilter(
  value: CellValue,
  column: TableColumn,
  filter: TableFilter,
): boolean {
  const { operator } = filter;

  if (operator === "isEmpty") return isEmptyCell(value, column);
  if (operator === "isNotEmpty") return !isEmptyCell(value, column);
  if (operator === "isChecked") return value === true;
  if (operator === "isUnchecked") return value !== true;

  if (operator === "isAnyOf" || operator === "isNoneOf") {
    const wanted = Array.isArray(filter.value) ? filter.value : [];
    if (wanted.length === 0) return true;
    const hit = selectedIds(value).some((id) => wanted.includes(id));
    return operator === "isAnyOf" ? hit : !hit;
  }

  const raw = typeof filter.value === "string" ? filter.value : "";
  // Une condition sans valeur saisie ne filtre rien : l'utilisateur est en
  // train de la composer, la vider brutalement serait déroutant.
  if (raw.trim() === "") return true;

  if (column.type === "number") {
    const cell = typeof value === "number" ? value : Number(cellText(value, column));
    const target = Number(raw);
    if (!Number.isFinite(cell) || !Number.isFinite(target)) return false;
    switch (operator) {
      case "eq":
        return cell === target;
      case "ne":
        return cell !== target;
      case "gt":
        return cell > target;
      case "lt":
        return cell < target;
      case "gte":
        return cell >= target;
      case "lte":
        return cell <= target;
      default:
        return true;
    }
  }

  if (column.type === "date") {
    // Les dates sont stockées en `YYYY-MM-DD` : la comparaison lexicographique
    // est déjà chronologique, pas besoin de reparser.
    const cell = cellText(value, column);
    if (!cell) return false;
    switch (operator) {
      case "is":
        return cell === raw;
      case "isBefore":
        return cell < raw;
      case "isAfter":
        return cell > raw;
      default:
        return true;
    }
  }

  const haystack = cellText(value, column).toLowerCase();
  const needle = raw.toLowerCase();
  switch (operator) {
    case "is":
      return haystack === needle;
    case "isNot":
      return haystack !== needle;
    case "contains":
      return haystack.includes(needle);
    case "doesNotContain":
      return !haystack.includes(needle);
    default:
      return true;
  }
}

export function applyFilters(
  rows: TableRowData[],
  columns: TableColumn[],
  filters: TableFilter[],
  conjunction: FilterConjunction,
): TableRowData[] {
  if (filters.length === 0) return rows;

  const columnsById = new Map(columns.map((c) => [c.id, c]));
  const active = filters.flatMap((filter) => {
    const column = columnsById.get(filter.columnId);
    return column ? [{ filter, column }] : [];
  });
  if (active.length === 0) return rows;

  return rows.filter((row) => {
    const test = ({ filter, column }: (typeof active)[number]) =>
      matchesFilter(row.cells[column.id] ?? null, column, filter);
    return conjunction === "all" ? active.every(test) : active.some(test);
  });
}
