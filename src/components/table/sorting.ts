import { cellText } from "./cellText";
import type { TableColumn, TableRowData } from "./types";

/**
 * Tri de colonne, persisté avec la table (`TableData.sorting`).
 *
 * Comme les filtres, et pour la même raison : un tri décrit une VUE de la
 * table, pas une lecture jetable. Le node du canvas l'applique donc lui aussi,
 * et le poser marque la fenêtre comme modifiée, au même titre qu'une largeur de
 * colonne. La recherche globale, elle, reste locale à la grille et meurt avec
 * elle — cf. `filters.ts`.
 *
 * `columnId` et non `id` comme chez tanstack : c'est une donnée stockée, elle
 * doit se lire seule. La traduction vers `SortingState` se fait dans `Table`.
 */
export interface TableSort {
  columnId: string;
  desc: boolean;
}

/**
 * La comparaison de la grille, extraite ici pour que la vue node trie
 * EXACTEMENT comme la fenêtre : deux comparateurs qui divergent donneraient
 * deux ordres pour un même tri enregistré.
 *
 * Lit la cellule par son TYPE (`cellText`) et non par la forme de sa valeur :
 * trier une colonne rich text sur le document sérialisé comparerait les
 * identifiants de bloc qui l'ouvrent, et une colonne select ses UUID.
 */
export function compareRowsByColumn(
  a: TableRowData,
  b: TableRowData,
  column: TableColumn,
): number {
  return cellText(a.cells[column.id] ?? null, column).localeCompare(
    cellText(b.cells[column.id] ?? null, column),
    undefined,
    { numeric: true, sensitivity: "base" },
  );
}

/**
 * Applique le tri persisté, dans l'ordre : le premier critère qui départage
 * tranche, les suivants n'interviennent qu'à égalité — c'est ce que fait
 * `getSortedRowModel` de tanstack, dont ceci est la contrepartie hors grille.
 *
 * Les critères dont la colonne n'existe plus sont ignorés, comme
 * `applyFilters` ignore les siens : une colonne peut disparaître entre deux
 * ouvertures. `Array.prototype.sort` est stable, donc à égalité sur tous les
 * critères les lignes gardent leur ordre stocké.
 */
export function applySorting(
  rows: TableRowData[],
  columns: TableColumn[],
  sorting: TableSort[],
): TableRowData[] {
  const columnsById = new Map(columns.map((c) => [c.id, c]));
  const active = sorting.flatMap((sort) => {
    const column = columnsById.get(sort.columnId);
    return column ? [{ column, desc: sort.desc }] : [];
  });
  if (active.length === 0) return rows;

  return [...rows].sort((a, b) => {
    for (const { column, desc } of active) {
      const delta = compareRowsByColumn(a, b, column);
      if (delta !== 0) return desc ? -delta : delta;
    }
    return 0;
  });
}
