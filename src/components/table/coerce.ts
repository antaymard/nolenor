import {
  coerceCellValue as coerceStoredCellValue,
  countLossyCells as countStoredLossyCells,
} from "@/../convex/lib/tableCellCoerce";
import type { CellValue, ColumnType, TableColumn } from "./types";

/**
 * Conversion d'une cellule quand la colonne change de type. L'implémentation
 * vit dans `convex/lib/tableCellCoerce` : le serveur l'applique à l'état
 * courant de la table (cf. `convex/lib/tableOps.ts`). Ce fichier ne fait que
 * la typer pour la grille.
 */
export function coerceCellValue(
  value: CellValue,
  fromColumn: TableColumn,
  to: ColumnType,
): CellValue {
  return coerceStoredCellValue(value, fromColumn, to) as CellValue;
}

export function countLossyCells(
  cells: CellValue[],
  fromColumn: TableColumn,
  to: ColumnType,
): number {
  return countStoredLossyCells(cells, fromColumn, to);
}
