import { richTextToPlainText } from "./richText";
import type {
  CellValue,
  ColumnType,
  LinkCellValue,
  NodeCellValue,
  SelectCellValue,
  SummaryKind,
  TableColumn,
} from "./types";

/**
 * Calculs de pied de colonne, façon « Calculate » de Notion.
 *
 * Toujours sur les lignes VISIBLES (filtrées et recherchées) : un total qui ne
 * suit pas le filtre affiché est un total faux du point de vue de qui le lit.
 */

export const SUMMARY_LABELS: Record<SummaryKind, string> = {
  countAll: "Count all",
  countEmpty: "Empty",
  countFilled: "Filled",
  countUnique: "Unique",
  percentEmpty: "Percent empty",
  percentFilled: "Percent filled",
  sum: "Sum",
  average: "Average",
  median: "Median",
  min: "Min",
  max: "Max",
  checked: "Checked",
  unchecked: "Unchecked",
  percentChecked: "Percent checked",
};

const COMMON: SummaryKind[] = [
  "countAll",
  "countFilled",
  "countEmpty",
  "countUnique",
  "percentFilled",
  "percentEmpty",
];

const NUMERIC: SummaryKind[] = ["sum", "average", "median", "min", "max"];

const CHECKBOX: SummaryKind[] = ["checked", "unchecked", "percentChecked"];

export function summariesFor(type: ColumnType): SummaryKind[] {
  if (type === "number") return [...NUMERIC, ...COMMON];
  if (type === "checkbox") return [...CHECKBOX, ...COMMON];
  return COMMON;
}

/** Clé de dédoublonnage stable, pour `countUnique`. */
function uniqueKey(value: CellValue, column: TableColumn): string {
  if (value == null) return "";
  switch (column.type) {
    case "richtext":
      return richTextToPlainText(value);
    case "link":
      return (value as LinkCellValue).href ?? "";
    case "node":
      return (value as NodeCellValue).nodeId ?? "";
    case "select":
      return Array.isArray(value) ? [...(value as SelectCellValue)].sort().join("|") : "";
    default:
      return String(value);
  }
}

function isFilled(value: CellValue, column: TableColumn): boolean {
  if (value == null) return false;
  if (column.type === "checkbox") return true;
  if (Array.isArray(value)) return value.length > 0;
  return uniqueKey(value, column).trim() !== "";
}

function numbersOf(values: CellValue[]): number[] {
  const out: number[] = [];
  for (const value of values) {
    const n = typeof value === "number" ? value : Number(value);
    if (value != null && value !== "" && Number.isFinite(n)) out.push(n);
  }
  return out;
}

function formatNumber(n: number): string {
  // Les moyennes et médianes tombent rarement rond : deux décimales suffisent,
  // et `Intl` retire les zéros inutiles pour les sommes entières.
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}

function percent(part: number, total: number): string {
  if (total === 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

/** Résultat affichable, ou `null` quand le calcul n'a pas de sens ici. */
export function computeSummary(
  kind: SummaryKind,
  values: CellValue[],
  column: TableColumn,
): string | null {
  const total = values.length;
  const filled = values.filter((v) => isFilled(v, column)).length;

  switch (kind) {
    case "countAll":
      return String(total);
    case "countFilled":
      return String(filled);
    case "countEmpty":
      return String(total - filled);
    case "percentFilled":
      return percent(filled, total);
    case "percentEmpty":
      return percent(total - filled, total);
    case "countUnique": {
      const seen = new Set<string>();
      for (const value of values) {
        if (isFilled(value, column)) seen.add(uniqueKey(value, column));
      }
      return String(seen.size);
    }
    case "checked":
      return String(values.filter((v) => v === true).length);
    case "unchecked":
      return String(values.filter((v) => v !== true).length);
    case "percentChecked":
      return percent(values.filter((v) => v === true).length, total);
    default:
      break;
  }

  const numbers = numbersOf(values);
  if (numbers.length === 0) return "—";

  switch (kind) {
    case "sum":
      return formatNumber(numbers.reduce((a, b) => a + b, 0));
    case "average":
      return formatNumber(numbers.reduce((a, b) => a + b, 0) / numbers.length);
    case "median": {
      const sorted = [...numbers].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return formatNumber(
        sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid],
      );
    }
    case "min":
      return formatNumber(Math.min(...numbers));
    case "max":
      return formatNumber(Math.max(...numbers));
    default:
      return null;
  }
}
