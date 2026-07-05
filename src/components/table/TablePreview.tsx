import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/table";
import { cn } from "@/lib/utils";
import { CellDisplay } from "./CellDisplay";
import type { TableColumn, TableRowData } from "./types";

export interface TablePreviewProps {
  columns: TableColumn[];
  rows: TableRowData[];
  className?: string;
}

export function TablePreview({ columns, rows, className }: TablePreviewProps) {
  if (columns.length === 0) return null;
  return (
    <Table className={cn(className)}>
      <TableHeader className="sticky top-0 z-10 bg-card border-b">
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
              >
                <CellDisplay
                  type={col.type}
                  value={row.cells[col.id]}
                  options={col.options}
                />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
