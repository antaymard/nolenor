import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import type { Id } from "@/../convex/_generated/dataModel";
import { useWindowFrameContext } from "@/components/windows/WindowFrameContext";
import InlineEditableText from "@/components/form-ui/InlineEditableText";
import { Button } from "@/components/shadcn/button";
import { TbDownload, TbPlus, TbUpload } from "react-icons/tb";
import {
  Table,
  TableImportDialog,
  buildCsv,
  downloadCsv,
  type TableImportResult,
} from "@/components/table";
import type {
  TableData,
  TableColumn,
  TableRowData,
  CellValue,
  ColumnType,
  SelectOption,
} from "@/components/table";

function TableWindow({ nodeDataId }: { nodeDataId: Id<"nodeDatas"> }) {
  const { setDirty, setSaveHandler } = useWindowFrameContext();
  const nodeDataValues = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const isLocked = false;

  const [localColumns, setLocalColumns] = useState<TableColumn[]>([]);
  const [localRows, setLocalRows] = useState<TableRowData[]>([]);
  const [localTitle, setLocalTitle] = useState<string>("");
  const [isDirty, setIsDirty] = useState(false);

  // Sync local state with live data when the user hasn't made edits
  useEffect(() => {
    if (isDirty) return;
    const table = (nodeDataValues?.table as TableData | undefined) ?? {
      columns: [],
      rows: [],
    };
    setLocalColumns(table.columns);
    setLocalRows(table.rows);
    setLocalTitle((nodeDataValues?.title as string | undefined) ?? "");
  }, [nodeDataValues, isDirty]);

  // Keep latest refs to avoid stale closures in save handler
  const columnsRef = useRef(localColumns);
  const rowsRef = useRef(localRows);
  const titleRef = useRef(localTitle);
  useEffect(() => {
    columnsRef.current = localColumns;
  }, [localColumns]);
  useEffect(() => {
    rowsRef.current = localRows;
  }, [localRows]);
  useEffect(() => {
    titleRef.current = localTitle;
  }, [localTitle]);

  useEffect(() => {
    setDirty(isDirty && !isLocked);
  }, [isDirty, isLocked, setDirty]);

  const handleSave = useCallback(() => {
    updateNodeDataValues({
      nodeDataId,
      values: {
        title: titleRef.current,
        table: { columns: columnsRef.current, rows: rowsRef.current },
      },
    });
    setIsDirty(false);
  }, [nodeDataId, updateNodeDataValues]);

  useEffect(() => {
    setSaveHandler(handleSave);
    return () => setSaveHandler(null);
  }, [handleSave, setSaveHandler]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  // --- Column management ---

  const addColumn = useCallback(
    (type: ColumnType = "text") => {
      const newCol: TableColumn = {
        id: crypto.randomUUID(),
        name: `Column ${columnsRef.current.length + 1}`,
        type,
      };
      setLocalColumns((cols) => [...cols, newCol]);
      setLocalRows((rows) =>
        rows.map((row) => ({
          ...row,
          cells: { ...row.cells, [newCol.id]: null },
        })),
      );
      markDirty();
    },
    [markDirty],
  );

  const deleteColumn = useCallback(
    (colId: string) => {
      setLocalColumns((cols) => cols.filter((c) => c.id !== colId));
      setLocalRows((rows) =>
        rows.map((row) => {
          const newCells = { ...row.cells };
          delete newCells[colId];
          return { ...row, cells: newCells };
        }),
      );
      markDirty();
    },
    [markDirty],
  );

  const updateColumnName = useCallback(
    (colId: string, name: string) => {
      setLocalColumns((cols) =>
        cols.map((c) => (c.id === colId ? { ...c, name } : c)),
      );
      markDirty();
    },
    [markDirty],
  );

  const updateColumnType = useCallback(
    (colId: string, type: ColumnType) => {
      setLocalColumns((cols) =>
        cols.map((c) => (c.id === colId ? { ...c, type } : c)),
      );
      setLocalRows((rows) =>
        rows.map((row) => ({
          ...row,
          cells: { ...row.cells, [colId]: null },
        })),
      );
      markDirty();
    },
    [markDirty],
  );

  // --- Row management ---

  const addRow = useCallback(() => {
    const newRow: TableRowData = {
      id: crypto.randomUUID(),
      cells: Object.fromEntries(
        columnsRef.current.map((col) => [col.id, null]),
      ),
    };
    setLocalRows((rows) => [...rows, newRow]);
    markDirty();
  }, [markDirty]);

  const deleteRow = useCallback(
    (rowId: string) => {
      setLocalRows((rows) => rows.filter((r) => r.id !== rowId));
      markDirty();
    },
    [markDirty],
  );

  const updateCell = useCallback(
    (rowId: string, colId: string, value: CellValue) => {
      setLocalRows((rows) =>
        rows.map((row) =>
          row.id === rowId
            ? { ...row, cells: { ...row.cells, [colId]: value } }
            : row,
        ),
      );
      markDirty();
    },
    [markDirty],
  );

  const reorderRows = useCallback(
    (orderedIds: string[]) => {
      setLocalRows((rows) => {
        const rowMap = new Map(rows.map((r) => [r.id, r]));
        return orderedIds.flatMap((id) => {
          const row = rowMap.get(id);
          return row ? [row] : [];
        });
      });
      markDirty();
    },
    [markDirty],
  );

  const reorderColumns = useCallback(
    (orderedIds: string[]) => {
      setLocalColumns((cols) => {
        const colMap = new Map(cols.map((c) => [c.id, c]));
        return orderedIds.flatMap((id) => {
          const col = colMap.get(id);
          return col ? [col] : [];
        });
      });
      markDirty();
    },
    [markDirty],
  );

  // --- CSV import / export ---

  const [importOpen, setImportOpen] = useState(false);

  const handleExportCsv = useCallback(() => {
    const csv = buildCsv(columnsRef.current, rowsRef.current);
    // Use the table's title as the filename when available, fall back to a
    // generic name. Strip filesystem-unfriendly chars.
    const base = (titleRef.current || "table").replace(/[\\/:*?"<>|]/g, "_");
    downloadCsv(base, csv);
  }, []);

  const handleImport = useCallback(
    (result: TableImportResult) => {
      if (result.replace) {
        setLocalColumns(result.columns);
        setLocalRows(result.rows);
      } else {
        // Append: keep existing columns/rows, then add the new ones. Existing
        // rows need null cells for any newly-added columns so the editors
        // don't blow up on undefined.
        const newColIds = result.columns
          .filter((c) => !columnsRef.current.some((ec) => ec.id === c.id))
          .map((c) => c.id);
        setLocalColumns(result.columns);
        setLocalRows((rows) => [
          ...rows.map((row) => {
            if (newColIds.length === 0) return row;
            const cells = { ...row.cells };
            for (const id of newColIds) cells[id] = null;
            return { ...row, cells };
          }),
          ...result.rows,
        ]);
      }
      markDirty();
    },
    [markDirty],
  );

  const updateColumnWidth = useCallback(
    (colId: string, width: number) => {
      setLocalColumns((cols) =>
        cols.map((c) => (c.id === colId ? { ...c, width } : c)),
      );
      markDirty();
    },
    [markDirty],
  );

  const updateColumnOptions = useCallback(
    (colId: string, options: SelectOption[], isMulti: boolean) => {
      const validIds = new Set(options.map((o) => o.id));
      setLocalColumns((cols) =>
        cols.map((c) => (c.id === colId ? { ...c, options, isMulti } : c)),
      );
      // Drop cell values that point to deleted options; for non-multi, keep at most one.
      setLocalRows((rows) =>
        rows.map((row) => {
          const current = row.cells[colId];
          if (!Array.isArray(current)) return row;
          const filtered = (current as string[]).filter((id) =>
            validIds.has(id),
          );
          const next = isMulti ? filtered : filtered.slice(0, 1);
          if (
            next.length === current.length &&
            next.every((id, i) => id === (current as string[])[i])
          ) {
            return row;
          }
          return { ...row, cells: { ...row.cells, [colId]: next } };
        }),
      );
      markDirty();
    },
    [markDirty],
  );

  if (!nodeDataValues) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b shrink-0">
        <InlineEditableText
          value={localTitle}
          onSave={(val) => {
            setLocalTitle(val);
            markDirty();
          }}
          placeholder="Sans titre"
          className="font-semibold text-lg min-w-0 flex-1"
          disabled={isLocked}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => setImportOpen(true)}
          disabled={isLocked}
          title="Importer un fichier CSV"
        >
          <TbUpload size={14} className="mr-1" />
          Importer
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExportCsv}
          disabled={localColumns.length === 0}
          title="Exporter au format CSV"
        >
          <TbDownload size={14} className="mr-1" />
          Exporter
        </Button>
      </div>
      <TableImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        existingColumns={localColumns}
        hasExistingData={localRows.length > 0 || localColumns.length > 0}
        onImport={handleImport}
      />

      <div className="relative flex-1 min-h-0">
        <Table
          columns={localColumns}
          rows={localRows}
          readOnly={isLocked}
          onCellChange={updateCell}
          onAddRow={addRow}
          onDeleteRow={deleteRow}
          onAddColumn={addColumn}
          onDeleteColumn={deleteColumn}
          onColumnNameChange={updateColumnName}
          onColumnTypeChange={updateColumnType}
          onColumnOrderChange={reorderColumns}
          onRowOrderChange={reorderRows}
          onColumnWidthChange={updateColumnWidth}
          onColumnOptionsChange={updateColumnOptions}
          className="h-full min-h-0"
        />
        {!isLocked && (
          <Button
            size="sm"
            variant="ghost"
            className="absolute bottom-3 left-3 z-20"
            onClick={addRow}
          >
            <TbPlus size={14} className="mr-1" />
            Add row
          </Button>
        )}
      </div>
    </div>
  );
}

export default memo(
  TableWindow,
  (prev, next) => prev.nodeDataId === next.nodeDataId,
);
