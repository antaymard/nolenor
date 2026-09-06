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
import type { RowHeight, TableColumn, TableRowData } from "./types";

export interface TablePreviewProps {
  columns: TableColumn[];
  rows: TableRowData[];
  /** Défaut `short` : l'aperçu du canvas reste dense quoi qu'il arrive. */
  rowHeight?: RowHeight;
  className?: string;
}

export function TablePreview({
  columns,
  rows,
  rowHeight = DEFAULT_ROW_HEIGHT,
  className,
}: TablePreviewProps) {
  if (columns.length === 0) return null;
  return (
    // `<table>` nu : le wrapper `overflow-x-auto` du `Table` shadcn est un
    // scrollport, et l'en-tête sticky ci-dessous s'y accrochait au lieu du
    // conteneur défilant du node.
    <table className={cn("w-full caption-bottom", className)}>
      <TableHeader className="sticky top-0 z-10 bg-white border-b border-slate-300">
        <TableRow>
          {columns.map((col) => (
            <TableHead
              key={col.id}
              style={col.width ? { width: col.width } : undefined}
            >
              {col.name}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.id}>
            {columns.map((col) => (
              <TableCell
                key={col.id}
                style={col.width ? { width: col.width } : undefined}
                className="align-top whitespace-normal"
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
      </TableBody>
    </table>
  );
}
