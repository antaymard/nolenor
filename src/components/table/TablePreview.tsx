import { useRef, type RefObject } from "react";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/table";
import { cn } from "@/lib/utils";
import { CellDisplay } from "./CellDisplay";
import { DEFAULT_ROW_HEIGHT } from "./types";
import { useRowWindow } from "./useRowWindow";
import type { RowHeight, TableColumn, TableRowData } from "./types";

/**
 * Doit refléter `defaultColumn.size` de `Table.tsx` : une colonne jamais
 * redimensionnée n'a pas de `width` persisté, et les deux vues doivent lui
 * donner la même.
 */
const DEFAULT_COLUMN_WIDTH = 150;

export interface TablePreviewProps {
  columns: TableColumn[];
  rows: TableRowData[];
  /** Défaut `short`. Le node transmet la hauteur réglée en édition. */
  rowHeight?: RowHeight;
  className?: string;
  /**
   * La zone qui fait défiler l'aperçu. Fournie (node du canvas), seules les
   * lignes visibles sont rendues, cf. `useRowWindow`. Absente (historique de
   * versions…), toutes les lignes le sont, comme avant.
   */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** Majorant de la hauteur visible, avec `scrollContainerRef`. */
  viewportHeightHint?: number;
}

export function TablePreview({
  columns,
  rows,
  rowHeight = DEFAULT_ROW_HEIGHT,
  className,
  scrollContainerRef,
  viewportHeightHint = 600,
}: TablePreviewProps) {
  const tbodyRef = useRef<HTMLTableSectionElement>(null);
  const windowed = scrollContainerRef !== undefined;
  const { renderCount, spacerHeight } = useRowWindow({
    enabled: windowed,
    rowCount: rows.length,
    scrollContainerRef,
    tbodyRef,
    viewportHeightHint,
  });

  if (columns.length === 0) return null;

  const renderedRows = windowed ? rows.slice(0, renderCount) : rows;

  const widths = columns.map((col) => col.width ?? DEFAULT_COLUMN_WIDTH);
  const total = widths.reduce((sum, width) => sum + width, 0);

  return (
    /*
     * `<table>` nu : le wrapper `overflow-x-auto` du `Table` shadcn est un
     * scrollport, et l'en-tête sticky ci-dessous s'y accrochait au lieu du
     * conteneur défilant du node.
     *
     * `table-layout: fixed` + `<colgroup>`, comme la grille d'édition : en
     * layout auto, la largeur posée sur un `<th>` n'est qu'une suggestion que le
     * navigateur redistribue, et les colonnes ne ressemblaient plus à ce qui
     * avait été réglé. Les `<col>` sont en POURCENTAGES et la table porte le
     * total en `min-width` : sous cette largeur on retombe au pixel près sur les
     * largeurs persistées (le node défile alors horizontalement), au-dessus les
     * colonnes s'étirent en gardant exactement leurs proportions.
     */
    <table
      className={cn("caption-bottom", className)}
      style={{ tableLayout: "fixed", width: "100%", minWidth: total }}
    >
      <colgroup>
        {columns.map((col, index) => (
          <col
            key={col.id}
            style={{ width: `${(widths[index] / total) * 100}%` }}
          />
        ))}
      </colgroup>
      <TableHeader className="sticky top-0 z-10 border-b border-border bg-background">
        <TableRow>
          {columns.map((col) => (
            <TableHead key={col.id} className="overflow-hidden">
              {col.name}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody ref={tbodyRef}>
        {renderedRows.map((row) => (
          <TableRow key={row.id}>
            {columns.map((col) => (
              <TableCell
                key={col.id}
                // `overflow-hidden` reproduit le clipping que `sortableCellStyle`
                // applique côté fenêtre : sans lui une cellule débordante
                // repoussait la largeur de sa colonne.
                className="align-top overflow-hidden whitespace-normal"
              >
                <CellDisplay
                  type={col.type}
                  value={row.cells[col.id]}
                  options={col.options}
                  rowHeight={rowHeight}
                />
              </TableCell>
            ))}
          </TableRow>
        ))}
        {/* Tient la place des lignes pas encore rendues : la zone défile et
            déborde comme si elles y étaient. Dernier enfant, donc sans
            bordure (`[&_tr:last-child]:border-0`) — et la dernière ligne
            rendue garde la sienne, comme toute ligne qui n'est pas la
            dernière de la table. */}
        {spacerHeight > 0 && (
          <tr aria-hidden style={{ height: spacerHeight }}>
            <td colSpan={columns.length} style={{ padding: 0, border: 0 }} />
          </tr>
        )}
      </TableBody>
    </table>
  );
}
