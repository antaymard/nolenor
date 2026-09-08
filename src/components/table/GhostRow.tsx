import type { Column } from "@tanstack/react-table";
import { TbPlus } from "react-icons/tb";
import { TableCell, TableRow } from "@/components/shadcn/table";
import { GUTTER_COLUMN_ID, ACTIONS_COLUMN_ID } from "./columnIds";
import { columnCellStyle } from "./sortableCell";
import type { TableRowData } from "./types";

export interface GhostRowProps {
  leafColumns: Column<TableRowData, unknown>[];
  /**
   * Vrai quand un tri, une recherche ou un filtre est actif : créer une ligne
   * remet alors la vue à plat, et l'annoncer évite que les filtres semblent
   * disparaître tout seuls.
   */
  clearsView?: boolean;
  /** Reçoit la colonne cliquée pour ouvrir directement le bon éditeur. */
  onCreate: (columnId: string) => void;
}

/**
 * La ligne fantôme, en dernière position du corps du tableau.
 *
 * C'est la seule façon d'ajouter une ligne, d'où deux exigences : elle reste
 * visible quel que soit le tri ou le filtre (sans quoi « je ne trouve pas, donc
 * je l'ajoute » serait une impasse), et cliquer dans n'importe laquelle de ses
 * cellules crée la ligne PUIS ouvre l'éditeur de cette cellule-là, pour qu'on
 * enchaîne sur la frappe sans second geste.
 */
export function GhostRow({ leafColumns, clearsView, onCreate }: GhostRowProps) {
  let firstDataColumnSeen = false;

  return (
    <TableRow className="group/ghost cursor-text border-b-0 text-muted-foreground/70 hover:bg-muted/40">
      {leafColumns.map((column) => {
        if (column.id === GUTTER_COLUMN_ID) {
          return (
            <TableCell key={column.id} className="w-14 px-2">
              <TbPlus size={14} className="opacity-60" />
            </TableCell>
          );
        }
        if (column.id === ACTIONS_COLUMN_ID) {
          return <TableCell key={column.id} className="w-8 px-1" />;
        }

        const isFirstDataColumn = !firstDataColumnSeen;
        firstDataColumnSeen = true;

        return (
          <GhostCell
            key={column.id}
            column={column}
            label={
              isFirstDataColumn
                ? clearsView
                  ? "New row — clears the current view"
                  : "New row"
                : ""
            }
            onClick={() => onCreate(column.id)}
          />
        );
      })}
    </TableRow>
  );
}

/**
 * Largeur et clipping de la colonne, sans enregistrement dnd : la ligne fantôme
 * ne s'anime pas pendant un déplacement de colonne, elle se replace au dépôt.
 * S'enregistrer comme sortable sous l'id de la colonne aurait dupliqué cet id
 * dans le contexte et écrasé l'en-tête, qui en est le seul propriétaire.
 */
function GhostCell({
  column,
  label,
  onClick,
}: {
  column: Column<TableRowData, unknown>;
  label: string;
  onClick: () => void;
}) {
  return (
    <TableCell
      style={columnCellStyle(column.getSize())}
      className="align-top"
      onClick={onClick}
    >
      <span className="block min-h-[1.4em] truncate px-1 text-sm">{label}</span>
    </TableCell>
  );
}
