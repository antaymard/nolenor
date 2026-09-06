import { assertNeverColumnType } from "@/../convex/lib/tableColumnTypes";
import { richTextToPlainText } from "./richText";
import type {
  CellValue,
  LinkCellValue,
  NodeCellValue,
  SelectCellValue,
  TableColumn,
} from "./types";

/**
 * Les trois lectures d'une cellule qui doivent être partagées.
 *
 * Il en existait sept variantes dispersées. La plupart des divergences sont
 * légitimes — l'export Markdown veut un vrai lien, la vue de l'agent veut les
 * ids pour pouvoir les réécrire — mais trois ne l'étaient pas :
 *
 * - la recherche globale devinait le type à la forme de la valeur et rendait
 *   `[object Object]` sur les colonnes node, les ids bruts sur les select ;
 * - `filters.isEmptyCell` et `summary.isFilled` étaient des inverses exacts
 *   appelant deux fonctions de texte différentes, si bien que « is not empty »
 *   et « Filled » pouvaient afficher deux nombres sur la même colonne ;
 * - l'export CSV n'avait pas de cas `select` et sortait des UUID.
 *
 * Les `default` appellent `assertNeverColumnType` : ce sont des lectures de
 * DONNÉES, un type oublié y produirait des valeurs fausses en silence.
 */

/** Libellés des options choisies, dans l'ordre de la cellule. */
export function selectLabels(
  value: CellValue,
  column: TableColumn,
  separator = ", ",
): string {
  if (!Array.isArray(value)) return "";
  const byId = new Map((column.options ?? []).map((o) => [o.id, o.label]));
  return (value as SelectCellValue)
    .map((id) => byId.get(id))
    .filter((label): label is string => !!label)
    .join(separator);
}

/**
 * Texte comparable d'une cellule : ce sur quoi portent la recherche globale et
 * les filtres textuels.
 *
 * Une cellule `node` n'expose qu'un id — sans le store des nodes on ne peut pas
 * en tirer un titre, donc `contains` sur une colonne node porte sur l'id.
 */
export function cellText(value: CellValue, column: TableColumn): string {
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
    case "select":
      return selectLabels(value, column, " ");
    case "checkbox":
      return value ? "true" : "false";
    case "text":
    case "number":
    case "date":
      return String(value);
    default:
      return assertNeverColumnType(column.type, "cellText");
  }
}

/**
 * Une cellule est-elle vide ?
 *
 * Une case à cocher n'est jamais vide : décochée est une valeur. Un lien dont
 * seul le titre est renseigné compte comme rempli — c'est ce que produisent
 * `LinkCellEditor` et la conversion de type, autant que les filtres et les
 * calculs s'accordent dessus.
 */
export function isCellEmpty(value: CellValue, column: TableColumn): boolean {
  if (value == null) return true;
  if (column.type === "checkbox") return false;
  if (Array.isArray(value)) return value.length === 0;
  return cellText(value, column).trim() === "";
}

/**
 * Clé d'identité d'une cellule, pour `Count unique`.
 *
 * Distincte de `cellText` à dessein : deux cellules select portant les mêmes
 * options dans un ordre différent sont la même valeur, et deux liens de même
 * URL aussi, quel que soit leur titre.
 */
export function cellIdentityKey(
  value: CellValue,
  column: TableColumn,
): string {
  if (value == null) return "";

  switch (column.type) {
    case "select":
      return Array.isArray(value)
        ? [...(value as SelectCellValue)].sort().join("|")
        : "";
    case "link":
      return (value as LinkCellValue).href ?? "";
    case "node":
      return (value as NodeCellValue).nodeId ?? "";
    case "richtext":
    case "checkbox":
    case "text":
    case "number":
    case "date":
      return cellText(value, column);
    default:
      return assertNeverColumnType(column.type, "cellIdentityKey");
  }
}
