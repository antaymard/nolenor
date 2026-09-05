import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import type { Id } from "@/../convex/_generated/dataModel";
import { useWindowFrameContext } from "@/components/windows/WindowFrameContext";
import InlineEditableText from "@/components/form-ui/InlineEditableText";
import { Button } from "@/components/shadcn/button";
import { TbDownload, TbUpload } from "react-icons/tb";
import {
  DEFAULT_ROW_HEIGHT,
  Table,
  TableImportDialog,
  buildCsv,
  coerceCellValue,
  downloadCsv,
  type TableImportResult,
} from "@/components/table";
import type {
  TableData,
  TableColumn,
  TableRowData,
  CellValue,
  ColumnType,
  RowHeight,
  SelectOption,
  SummaryKind,
} from "@/components/table";

function TableWindow({ nodeDataId }: { nodeDataId: Id<"nodeDatas"> }) {
  const { setDirty, setSaveHandler } = useWindowFrameContext();
  const nodeDataValues = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const isLocked = false;

  const [localColumns, setLocalColumns] = useState<TableColumn[]>([]);
  const [localRows, setLocalRows] = useState<TableRowData[]>([]);
  const [localRowHeight, setLocalRowHeight] =
    useState<RowHeight>(DEFAULT_ROW_HEIGHT);
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
    setLocalRowHeight(table.rowHeight ?? DEFAULT_ROW_HEIGHT);
    setLocalTitle((nodeDataValues?.title as string | undefined) ?? "");
  }, [nodeDataValues, isDirty]);

  // Keep latest refs to avoid stale closures in save handler
  const columnsRef = useRef(localColumns);
  const rowsRef = useRef(localRows);
  const titleRef = useRef(localTitle);
  const rowHeightRef = useRef(localRowHeight);
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
    rowHeightRef.current = localRowHeight;
  }, [localRowHeight]);

  useEffect(() => {
    setDirty(isDirty && !isLocked);
  }, [isDirty, isLocked, setDirty]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    const columns = columnsRef.current;
    const rows = rowsRef.current;
    const title = titleRef.current;
    const rowHeight = rowHeightRef.current;
    const success = await updateNodeDataValues({
      nodeDataId,
      values: {
        title,
        table: { columns, rows, rowHeight },
      },
    });
    const hasPendingEdits =
      columnsRef.current !== columns ||
      rowsRef.current !== rows ||
      titleRef.current !== title ||
      rowHeightRef.current !== rowHeight;
    if (success && !hasPendingEdits) {
      setIsDirty(false);
    }
    return success && !hasPendingEdits;
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
      const previous = columnsRef.current.find((c) => c.id === colId);
      setLocalColumns((cols) =>
        cols.map((c) => {
          if (c.id !== colId) return c;
          // Les options et le mode multi n'ont de sens que pour un select :
          // les traîner sur un autre type ressortirait au retour en arrière.
          const { options: _options, isMulti: _isMulti, ...rest } = c;
          return type === "select"
            ? { ...c, type, summary: undefined }
            : { ...rest, type, summary: undefined };
        }),
      );
      // Avant, changer de type vidait TOUTES les cellules de la colonne. On
      // convertit désormais ce qui peut l'être (texte <-> rich text, nombres,
      // dates, liens, labels de select) ; le reste retombe sur null comme avant.
      setLocalRows((rows) =>
        rows.map((row) => ({
          ...row,
          cells: {
            ...row.cells,
            [colId]: previous
              ? coerceCellValue(row.cells[colId] ?? null, previous, type)
              : null,
          },
        })),
      );
      markDirty();
    },
    [markDirty],
  );

  // --- Row management ---

  // Renvoie l'id : la ligne fantôme de la grille enchaîne dessus pour ouvrir
  // l'éditeur de la cellule sur laquelle l'utilisateur vient de cliquer.
  const addRow = useCallback((): string => {
    const newRow: TableRowData = {
      id: crypto.randomUUID(),
      cells: Object.fromEntries(
        columnsRef.current.map((col) => [col.id, null]),
      ),
    };
    setLocalRows((rows) => [...rows, newRow]);
    markDirty();
    return newRow.id;
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

  const updateColumnSummary = useCallback(
    (colId: string, summary: SummaryKind | undefined) => {
      setLocalColumns((cols) =>
        cols.map((c) => (c.id === colId ? { ...c, summary } : c)),
      );
      markDirty();
    },
    [markDirty],
  );

  const updateRowHeight = useCallback(
    (rowHeight: RowHeight) => {
      setLocalRowHeight(rowHeight);
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
          placeholder="Untitled"
          className="font-semibold text-lg min-w-0 flex-1"
          disabled={isLocked}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => setImportOpen(true)}
          disabled={isLocked}
          title="Import a CSV file"
        >
          <TbUpload size={14} className="mr-1" />
          Import
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={handleExportCsv}
          disabled={localColumns.length === 0}
          title="Export in CSV"
        >
          <TbDownload size={14} className="mr-1" />
          Export
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
          rowHeight={localRowHeight}
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
          onColumnSummaryChange={updateColumnSummary}
          onRowHeightChange={updateRowHeight}
          className="h-full min-h-0"
        />
      </div>
    </div>
  );
}

export default memo(
  TableWindow,
  (prev, next) => prev.nodeDataId === next.nodeDataId,
);
