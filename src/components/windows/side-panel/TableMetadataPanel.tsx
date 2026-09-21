import { TbColumns3, TbRowInsertBottom } from "react-icons/tb";

export function TableMetadataPanel({
  columnCount,
  rowCount,
}: {
  columnCount: number;
  rowCount: number;
}) {
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
