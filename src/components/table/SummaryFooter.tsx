import type { Column } from "@tanstack/react-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { TableCell, TableFooter, TableRow } from "@/components/shadcn/table";
import { cn } from "@/lib/utils";
import { isUtilityColumn } from "./columnIds";
import { useSortableCellStyle } from "./sortableCell";
import { SUMMARY_LABELS, computeSummary, summariesFor } from "./summary";
import type { SummaryKind, TableColumn, TableRowData } from "./types";

export interface SummaryFooterProps {
  leafColumns: Column<TableRowData, unknown>[];
  columnsById: Map<string, TableColumn>;
  /** Les lignes VISIBLES : un total qui ignore le filtre affiché est un faux total. */
  rows: TableRowData[];
  readOnly?: boolean;
  onSummaryChange: (colId: string, kind: SummaryKind | undefined) => void;
}

export function SummaryFooter({
  leafColumns,
  columnsById,
  rows,
  readOnly,
  onSummaryChange,
}: SummaryFooterProps) {
  return (
    <TableFooter className="sticky bottom-0 z-10 border-t bg-background/95 backdrop-blur-sm">
      <TableRow className="group/summary hover:bg-transparent">
        {leafColumns.map((leaf) => {
          if (isUtilityColumn(leaf.id)) {
            return <TableCell key={leaf.id} className="w-8 px-1" />;
          }
          const column = columnsById.get(leaf.id);
          if (!column) return <TableCell key={leaf.id} />;
          return (
            <SummaryCell
              key={leaf.id}
              leaf={leaf}
              column={column}
              rows={rows}
              readOnly={readOnly}
              onSummaryChange={onSummaryChange}
            />
          );
        })}
      </TableRow>
    </TableFooter>
  );
}

function SummaryCell({
  leaf,
  column,
  rows,
  readOnly,
  onSummaryChange,
}: {
  leaf: Column<TableRowData, unknown>;
  column: TableColumn;
  rows: TableRowData[];
  readOnly?: boolean;
  onSummaryChange: (colId: string, kind: SummaryKind | undefined) => void;
}) {
  const { setNodeRef, style } = useSortableCellStyle(column.id, leaf.getSize());
  const kind = column.summary;
  const result = kind
    ? computeSummary(
        kind,
        rows.map((row) => row.cells[column.id] ?? null),
        column,
      )
    : null;

  const label =
    kind && result ? (
      <>
        <span className="mr-1 text-muted-foreground">{SUMMARY_LABELS[kind]}</span>
        <span className="font-medium tabular-nums">{result}</span>
      </>
    ) : (
      "Calculate"
    );

  const body = (
    <span
      className={cn(
        "block truncate px-1 text-right text-xs",
        result
          ? "text-foreground"
          : "text-muted-foreground/0 group-hover/summary:text-muted-foreground/70",
      )}
    >
      {label}
    </span>
  );

  if (readOnly) {
    return (
      <TableCell ref={setNodeRef} style={style} className="py-1">
        {body}
      </TableCell>
    );
  }

  return (
    <TableCell
      ref={setNodeRef}
      style={style}
      className="cursor-pointer py-1 hover:bg-muted/50"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="block w-full">
            {body}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => onSummaryChange(column.id, undefined)}
            className={cn(!kind && "font-semibold")}
          >
            None
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {summariesFor(column.type).map((value) => (
            <DropdownMenuItem
              key={value}
              onClick={() => onSummaryChange(column.id, value)}
              className={cn(value === kind && "font-semibold")}
            >
              {SUMMARY_LABELS[value]}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </TableCell>
  );
}
