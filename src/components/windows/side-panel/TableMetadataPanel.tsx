import { useDeferredValue, useMemo } from "react";
import { TbColumns3, TbRowInsertBottom } from "react-icons/tb";
import type { TableColumn, TableRowData } from "@/components/table/types";
import { searchTableRows, TABLE_SEARCH_LIMIT } from "@/lib/tableSearch";
import { useWindowSearchQuery } from "../WindowSearchContext";
import { SearchResultsList } from "./SearchResultsList";

/**
 * Plan tab of the table window: column and row counts. With a search query,
 * shows the matching cells instead.
 */
export function TableMetadataPanel({
  columns,
  rows,
  onSelectRow,
}: {
  columns: TableColumn[];
  rows: TableRowData[];
  onSelectRow: (rowId: string) => void;
}) {
  const query = useWindowSearchQuery().trim();
  if (query) {
    return (
      <TableSearchResults
        query={query}
        columns={columns}
        rows={rows}
        onSelectRow={onSelectRow}
      />
    );
  }

  const columnCount = columns.length;
  const rowCount = rows.length;
  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2 rounded-lg border p-3">
        <TbColumns3 className="size-4 shrink-0 text-slate-500" />
        <span className="text-sm text-slate-600">
          {columnCount} {columnCount === 1 ? "column" : "columns"}
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-lg border p-3">
        <TbRowInsertBottom className="size-4 shrink-0 text-slate-500" />
        <span className="text-sm text-slate-600">
          {rowCount} {rowCount === 1 ? "row" : "rows"}
        </span>
      </div>
    </div>
  );
}

function TableSearchResults({
  query,
  columns,
  rows,
  onSelectRow,
}: {
  query: string;
  columns: TableColumn[];
  rows: TableRowData[];
  onSelectRow: (rowId: string) => void;
}) {
  const deferredQuery = useDeferredValue(query);
  const hits = useMemo(
    () => searchTableRows(columns, rows, deferredQuery),
    [columns, rows, deferredQuery],
  );
  return (
    <SearchResultsList
      results={hits}
      query={query}
      onSelect={(hit) => onSelectRow(hit.rowId)}
      truncated={hits.length >= TABLE_SEARCH_LIMIT}
      className="h-full"
    />
  );
}
