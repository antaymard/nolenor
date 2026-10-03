import { cellText } from "@/components/table/cellText";
import type { TableColumn, TableRowData } from "@/components/table/types";
import { findSearchMatch } from "@/lib/searchMatch";
import type { SearchResult } from "@/components/windows/side-panel/SearchResultsList";

export type TableSearchHit = SearchResult & { rowId: string };

/** Plafond du nombre de résultats : une grosse table a des milliers de cellules. */
export const TABLE_SEARCH_LIMIT = 200;

/**
 * Cellules dont le texte contient `query`, ligne par ligne puis colonne par
 * colonne. Le texte est lu par `cellText`, comme la recherche de la toolbar :
 * libellés des select, titres des nodes, rich text à plat.
 */
export function searchTableRows(
  columns: readonly TableColumn[],
  rows: readonly TableRowData[],
  query: string,
): TableSearchHit[] {
  const hits: TableSearchHit[] = [];
  for (const row of rows) {
    for (const column of columns) {
      const text = cellText(row.cells?.[column.id], column);
      const match = findSearchMatch(text, query);
      if (!match) continue;
      hits.push({
        key: `${row.id}:${column.id}`,
        rowId: row.id,
        text,
        ...match,
        label: column.name,
      });
      if (hits.length >= TABLE_SEARCH_LIMIT) return hits;
    }
  }
  return hits;
}
