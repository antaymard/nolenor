import { useState } from "react";
import { TbChevronLeft, TbChevronRight, TbTrash } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { CellEditor } from "./CellEditor";
import { COLUMN_TYPE_CONFIG } from "./types";
import type { CellValue, TableColumn, TableRowData } from "./types";

export interface RowRecordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  columns: TableColumn[];
  /** Les lignes DANS L'ORDRE AFFICHÉ, pour que précédent/suivant suive le tri. */
  rows: TableRowData[];
  rowId: string;
  readOnly?: boolean;
  onNavigate: (rowId: string) => void;
  onCellChange: (rowId: string, colId: string, value: CellValue) => void;
  onDeleteRow: (rowId: string) => void;
  onEditColumnOptions?: (colId: string) => void;
}

/**
 * Une ligne ouverte comme une fiche.
 *
 * C'est la vraie réponse au texte tronqué : dans la grille une cellule est
 * bornée par la largeur de sa colonne, ici chaque champ prend toute la largeur
 * disponible et le rich text a enfin une surface d'édition décente.
 *
 * Les éditeurs sont exactement ceux de la grille (`CellEditor`) : une valeur
 * saisie ici et une valeur saisie là-bas passent par le même code.
 */
export function RowRecordDialog({
  open,
  onOpenChange,
  columns,
  rows,
  rowId,
  readOnly,
  onNavigate,
  onCellChange,
  onDeleteRow,
  onEditColumnOptions,
}: RowRecordDialogProps) {
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);

  const index = rows.findIndex((r) => r.id === rowId);
  const row = index === -1 ? undefined : rows[index];

  if (!row) return null;

  const go = (delta: number) => {
    const next = rows[index + delta];
    if (!next) return;
    setEditingColumnId(null);
    onNavigate(next.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="flex-row items-center gap-2 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-base">
              Row {index + 1}
              <span className="ml-1 font-normal text-muted-foreground">
                of {rows.length}
              </span>
            </DialogTitle>
            <DialogDescription className="sr-only">
              Every field of this row, at full width.
            </DialogDescription>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={index <= 0}
            onClick={() => go(-1)}
            title="Previous row"
          >
            <TbChevronLeft size={16} />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={index >= rows.length - 1}
            onClick={() => go(1)}
            title="Next row"
          >
            <TbChevronRight size={16} />
          </Button>
          {/* Une marge à droite pour ne pas passer sous la croix de fermeture. */}
          <span className="w-4" />
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 py-4">
          {columns.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              This table has no columns yet.
            </p>
          )}
          {columns.map((column) => {
            const Icon = COLUMN_TYPE_CONFIG[column.type].icon;
            return (
              <div key={column.id} className="flex flex-col gap-1.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Icon size={13} className="shrink-0 opacity-70" />
                  {column.name}
                </span>
                <div className="rounded-md border px-2 py-1.5">
                  <CellEditor
                    type={column.type}
                    value={row.cells[column.id]}
                    isEditing={editingColumnId === column.id}
                    readOnly={!!readOnly}
                    options={column.options}
                    isMulti={column.isMulti}
                    // La fiche existe précisément pour montrer le contenu en
                    // entier : aucune raison d'y appliquer le clamp de la grille.
                    rowHeight="tall"
                    onClick={() => {
                      if (readOnly) return;
                      if (column.type === "checkbox") {
                        onCellChange(row.id, column.id, !row.cells[column.id]);
                      } else if (
                        column.type === "select" &&
                        (column.options?.length ?? 0) === 0
                      ) {
                        onEditColumnOptions?.(column.id);
                      } else {
                        setEditingColumnId(column.id);
                      }
                    }}
                    onChange={(value) => onCellChange(row.id, column.id, value)}
                    onBlur={() => setEditingColumnId(null)}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {!readOnly && (
          <div className="flex justify-end border-t px-4 py-2">
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                onDeleteRow(row.id);
                onOpenChange(false);
              }}
            >
              <TbTrash size={15} />
              Delete row
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
