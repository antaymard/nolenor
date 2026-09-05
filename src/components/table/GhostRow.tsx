import type { CSSProperties } from "react";
import type { Column } from "@tanstack/react-table";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { TbPlus } from "react-icons/tb";
import { TableCell, TableRow } from "@/components/shadcn/table";
import { GUTTER_COLUMN_ID, ACTIONS_COLUMN_ID } from "./columnIds";
import type { TableRowData } from "./types";

export interface GhostRowProps {
  leafColumns: Column<TableRowData, unknown>[];
  /** Reçoit la colonne cliquée pour ouvrir directement le bon éditeur. */
  onCreate: (columnId: string) => void;
}

/**
 * La ligne fantôme, en dernière position du corps du tableau.
 *
 * Elle remplace l'ancien bouton « Add row » : un `Button` en `absolute
 * bottom-3 left-3` posé par la fenêtre PAR-DESSUS la zone de scroll, que la
 * grille devait compenser par un `pb-20` pour qu'il ne recouvre pas la dernière
 * ligne. On ne voyait donc pas où on ajoutait, et le bouton flottait au-dessus
 * des données.
 *
 * Ici l'affordance est à sa place — après la dernière ligne, à la bonne largeur
 * de colonne — et cliquer dans n'importe laquelle de ses cellules crée
 * réellement la ligne puis ouvre l'éditeur de CETTE cellule : on enchaîne
 * directement sur la frappe, sans second geste.
 */
export function GhostRow({ leafColumns, onCreate }: GhostRowProps) {
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
            label={isFirstDataColumn ? "New row" : ""}
            onClick={() => onCreate(column.id)}
          />
        );
      })}
    </TableRow>
  );
}

/**
 * Sans `useSortable`, les cellules de la ligne fantôme resteraient sur place
 * pendant qu'on déplace une colonne, alors que tout le reste du tableau suit.
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
  const { isDragging, setNodeRef, transform } = useSortable({ id: column.id });
  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: "relative",
    transform: CSS.Translate.toString(transform),
    transition: "width transform 0.2s ease-in-out",
    width: column.getSize(),
    overflow: "hidden",
  };
  return (
    <TableCell ref={setNodeRef} style={style} className="align-top" onClick={onClick}>
      <span className="block min-h-[1.4em] truncate px-1 text-sm">{label}</span>
    </TableCell>
  );
}
