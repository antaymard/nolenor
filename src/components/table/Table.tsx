import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type Cell,
  type ColumnDef,
  type FilterFn,
  type Header,
  type Row,
  type SortingState,
} from "@tanstack/react-table";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DraggableAttributes,
  type DragEndEvent,
} from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import {
  restrictToHorizontalAxis,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Table as ShadcnTable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/table";
import { Button } from "@/components/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import {
  TbArrowsDiagonal,
  TbGripVertical,
  TbPlus,
  TbTrash,
} from "react-icons/tb";
import { cn } from "@/lib/utils";
import { CellEditor } from "./CellEditor";
import { ColHeader } from "./ColHeader";
import { GhostRow } from "./GhostRow";
import { RowRecordDialog } from "./RowRecordDialog";
import { SelectOptionsDialog } from "./SelectOptionsDialog";
import { SummaryFooter } from "./SummaryFooter";
import { TableToolbar } from "./TableToolbar";
import { ACTIONS_COLUMN_ID, GUTTER_COLUMN_ID, isUtilityColumn } from "./columnIds";
import { countLossyCells } from "./coerce";
import { applyFilters, type FilterConjunction, type TableFilter } from "./filters";
import { richTextToPlainText } from "./richText";
import {
  DEFAULT_ROW_HEIGHT,
  columnTypeEntries,
  type CellValue,
  type ColumnType,
  type LinkCellValue,
  type RowHeight,
  type SelectOption,
  type SummaryKind,
  type TableColumn,
  type TableRowData,
} from "./types";

export interface TableProps {
  columns: TableColumn[];
  rows: TableRowData[];
  readOnly?: boolean;
  rowHeight?: RowHeight;
  onCellChange?: (rowId: string, colId: string, value: CellValue) => void;
  /** Renvoie l'id de la ligne créée, pour enchaîner sur l'édition d'une cellule. */
  onAddRow?: () => string | undefined;
  onDeleteRow?: (rowId: string) => void;
  onAddColumn?: (type: ColumnType) => void;
  onDeleteColumn?: (colId: string) => void;
  onColumnNameChange?: (colId: string, name: string) => void;
  onColumnTypeChange?: (colId: string, type: ColumnType) => void;
  onColumnOrderChange?: (orderedIds: string[]) => void;
  onRowOrderChange?: (orderedIds: string[]) => void;
  onColumnWidthChange?: (colId: string, width: number) => void;
  onColumnOptionsChange?: (
    colId: string,
    options: SelectOption[],
    isMulti: boolean,
  ) => void;
  onColumnSummaryChange?: (colId: string, summary: SummaryKind | undefined) => void;
  onRowHeightChange?: (rowHeight: RowHeight) => void;
  className?: string;
}

interface EditingCell {
  rowId: string;
  columnId: string;
}

const GUTTER_WIDTH = 56;

const globalFilterFn: FilterFn<TableRowData> = (row, columnId, filterValue) => {
  const value = row.getValue(columnId);
  if (value == null) return false;
  const term = (filterValue as string).toLowerCase();

  if (typeof value === "object" && "href" in (value as object)) {
    const link = value as LinkCellValue;
    return (
      (link.pageTitle?.toLowerCase().includes(term) ?? false) ||
      (link.href?.toLowerCase().includes(term) ?? false)
    );
  }
  // Une cellule rich text est un document : `String()` y donnerait
  // « [object Object] » et la recherche ne trouverait jamais rien.
  if (typeof value === "string" && value.startsWith("[{")) {
    const plain = richTextToPlainText(value);
    if (plain) return plain.toLowerCase().includes(term);
  }
  return String(value).toLowerCase().includes(term);
};

function DraggableHeader({
  header,
  canDrag,
  children,
}: {
  header: Header<TableRowData, unknown>;
  canDrag: boolean;
  children: (props: { dragHandle?: React.ReactNode }) => React.ReactNode;
}) {
  const { isDragging, listeners, setNodeRef, transform } = useSortable({
    id: header.column.id,
    disabled: !canDrag,
  });
  const isResizing = header.column.getIsResizing();
  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: "relative",
    transform: CSS.Translate.toString(transform),
    transition: isResizing
      ? "transform 0.2s ease-in-out"
      : "width transform 0.2s ease-in-out",
    zIndex: isDragging ? 30 : undefined,
    width: header.getSize(),
    userSelect: isResizing ? "none" : undefined,
    overflow: "hidden",
  };
  return (
    <TableHead
      ref={setNodeRef}
      style={style}
      className="group/head sticky top-0 z-20 bg-background"
    >
      <div className="flex items-center gap-0.5">
        <div className="min-w-0 flex-1">
          {children({
            dragHandle: canDrag ? (
              <span
                {...listeners}
                role="presentation"
                className="absolute inset-0 cursor-grab text-muted-foreground/60 opacity-0 group-hover/head:opacity-100 hover:text-foreground active:cursor-grabbing"
                title="Drag to reorder"
              >
                <TbGripVertical size={13} />
              </span>
            ) : undefined,
          })}
        </div>
      </div>
      <div
        onMouseDown={header.getResizeHandler()}
        onTouchStart={header.getResizeHandler()}
        className={cn(
          "absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-border",
          isResizing && "bg-primary/60",
        )}
      />
    </TableHead>
  );
}

function DraggableCell({
  cell,
  onCellClick,
  children,
}: {
  cell: Cell<TableRowData, unknown>;
  onCellClick?: () => void;
  children: React.ReactNode;
}) {
  const { isDragging, setNodeRef, transform } = useSortable({
    id: cell.column.id,
  });
  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: "relative",
    transform: CSS.Translate.toString(transform),
    transition: "width transform 0.2s ease-in-out",
    zIndex: isDragging ? 1 : 0,
    width: cell.column.getSize(),
    overflow: "hidden",
  };
  return (
    <TableCell
      ref={setNodeRef}
      style={style}
      onClick={onCellClick}
      // Le `whitespace-nowrap` du TableCell shadcn est partagé par toute l'app :
      // on le neutralise ici plutôt que de le retirer là-bas.
      className={cn(
        "align-top whitespace-normal",
        onCellClick && "cursor-text",
      )}
    >
      {children}
    </TableCell>
  );
}

function RowGutter({
  index,
  canDrag,
  attributes,
  listeners,
  setActivatorNodeRef,
  onExpand,
}: {
  index: number;
  canDrag: boolean;
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
  onExpand?: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5 text-muted-foreground">
      <span className="w-5 shrink-0 text-right text-xs tabular-nums opacity-60 group-hover/tablerow:opacity-0">
        {index + 1}
      </span>
      <div className="-ml-5 flex items-center opacity-0 group-hover/tablerow:opacity-100">
        {canDrag ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            className="cursor-grab text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
            tabIndex={-1}
            title="Drag to reorder"
          >
            <TbGripVertical size={13} />
          </button>
        ) : (
          <span className="w-[13px]" />
        )}
        {onExpand && (
          <Button
            size="icon-sm"
            variant="ghost"
            className="size-5"
            onClick={onExpand}
            title="Open row"
          >
            <TbArrowsDiagonal size={13} />
          </Button>
        )}
      </div>
    </div>
  );
}

function DraggableRow({
  row,
  canDrag,
  children,
}: {
  row: Row<TableRowData>;
  canDrag: boolean;
  children: (dragHandleProps: {
    attributes: DraggableAttributes;
    listeners: SyntheticListenerMap | undefined;
    setActivatorNodeRef: (element: HTMLElement | null) => void;
  }) => React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    transform,
    transition,
    setActivatorNodeRef,
    setNodeRef,
    isDragging,
  } = useSortable({
    id: row.original.id,
    disabled: !canDrag,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.8 : 1,
    zIndex: isDragging ? 1 : 0,
    position: "relative",
  };
  return (
    <TableRow ref={setNodeRef} style={style} className="group/tablerow">
      {children({ attributes, listeners, setActivatorNodeRef })}
    </TableRow>
  );
}

export function Table({
  columns: tableColumns,
  rows,
  readOnly = false,
  rowHeight = DEFAULT_ROW_HEIGHT,
  onCellChange,
  onAddRow,
  onDeleteRow,
  onAddColumn,
  onDeleteColumn,
  onColumnNameChange,
  onColumnTypeChange,
  onColumnOrderChange,
  onRowOrderChange,
  onColumnWidthChange,
  onColumnOptionsChange,
  onColumnSummaryChange,
  onRowHeightChange,
  className,
}: TableProps) {
  const tableRootRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [filters, setFilters] = useState<TableFilter[]>([]);
  const [conjunction, setConjunction] = useState<FilterConjunction>("all");
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [optionsDialogColumnId, setOptionsDialogColumnId] = useState<
    string | null
  >(null);
  const [recordRowId, setRecordRowId] = useState<string | null>(null);
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      tableColumns.filter((c) => c.width != null).map((c) => [c.id, c.width!]),
    ),
  );

  const columnsById = useMemo(
    () => new Map(tableColumns.map((c) => [c.id, c])),
    [tableColumns],
  );

  /**
   * L'ordre des colonnes est DÉDUIT de `tableColumns`, qui est la source de
   * vérité (un drag remonte au parent, qui réordonne son tableau). Le tenir en
   * état local obligeait à le resynchroniser à la main, et cette
   * resynchronisation repartait de l'ordre du schéma : ajouter une colonne
   * effaçait le réordonnancement manuel de l'utilisateur.
   */
  const columnOrder = useMemo(
    () => [
      ...(readOnly ? [] : [GUTTER_COLUMN_ID]),
      ...tableColumns.map((c) => c.id),
      ...(readOnly ? [] : [ACTIONS_COLUMN_ID]),
    ],
    [tableColumns, readOnly],
  );

  // Les colonnes ajoutées adoptent leur largeur persistée, celles qui
  // disparaissent quittent l'état — sans écraser un redimensionnement en cours.
  useEffect(() => {
    setColumnSizing((prev) => {
      const next: Record<string, number> = {};
      for (const col of tableColumns) {
        const width = col.id in prev ? prev[col.id] : col.width;
        if (width != null) next[col.id] = width;
      }
      const sameSize = Object.keys(next).length === Object.keys(prev).length;
      if (sameSize && Object.keys(next).every((k) => next[k] === prev[k])) {
        return prev;
      }
      return next;
    });
  }, [tableColumns]);

  // Le réordonnancement de lignes n'a plus de sens dès que l'ordre affiché
  // n'est plus l'ordre stocké.
  const canReorderRows =
    !readOnly && sorting.length === 0 && globalFilter === "" && filters.length === 0;

  const onColumnWidthChangeRef = useRef(onColumnWidthChange);
  onColumnWidthChangeRef.current = onColumnWidthChange;

  const visibleRows = useMemo(
    () => applyFilters(rows, tableColumns, filters, conjunction),
    [rows, tableColumns, filters, conjunction],
  );

  const openCell = useCallback(
    (rowId: string, colId: string) => {
      const col = columnsById.get(colId);
      if (!col || readOnly) return;
      if (col.type === "checkbox") return;
      // Un select sans option n'a rien à proposer : on envoie d'abord définir
      // les options plutôt que d'ouvrir une liste vide.
      if (col.type === "select" && (col.options?.length ?? 0) === 0) {
        setOptionsDialogColumnId(colId);
        return;
      }
      setEditingCell({ rowId, columnId: colId });
    },
    [columnsById, readOnly],
  );

  /** Matérialise la ligne fantôme et ouvre l'éditeur de la cellule cliquée. */
  const createRowAndEdit = useCallback(
    (columnId: string) => {
      const newRowId = onAddRow?.();
      if (!newRowId) return;
      const col = columnsById.get(columnId);
      if (col && col.type !== "checkbox") {
        setEditingCell({ rowId: newRowId, columnId });
      }
    },
    [columnsById, onAddRow],
  );

  const columns = useMemo<ColumnDef<TableRowData>[]>(
    () => [
      ...(readOnly
        ? []
        : [
            {
              id: GUTTER_COLUMN_ID,
              size: GUTTER_WIDTH,
              enableSorting: false,
              enableGlobalFilter: false,
              enableResizing: false,
              header: () => null,
              cell: () => null,
            } satisfies ColumnDef<TableRowData>,
          ]),
      ...tableColumns.map(
        (col): ColumnDef<TableRowData> => ({
          enableResizing: true,
          id: col.id,
          accessorFn: (row) => row.cells[col.id],
          cell: ({ row }) => {
            const isEditing =
              editingCell?.rowId === row.original.id &&
              editingCell?.columnId === col.id;
            const value = row.original.cells[col.id];
            return (
              <CellEditor
                type={col.type}
                value={value}
                isEditing={isEditing}
                readOnly={readOnly}
                options={col.options}
                isMulti={col.isMulti}
                rowHeight={rowHeight}
                onClick={() => {
                  if (readOnly) return;
                  if (col.type === "checkbox") {
                    onCellChange?.(row.original.id, col.id, !value);
                    return;
                  }
                  openCell(row.original.id, col.id);
                }}
                onChange={(val) => onCellChange?.(row.original.id, col.id, val)}
                onBlur={() => {
                  setEditingCell(null);
                  tableRootRef.current?.focus();
                }}
              />
            );
          },
        }),
      ),
      ...(readOnly
        ? []
        : [
            {
              id: ACTIONS_COLUMN_ID,
              size: 36,
              enableSorting: false,
              enableGlobalFilter: false,
              enableResizing: false,
              header: () => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="size-6"
                      title="Add a column"
                    >
                      <TbPlus size={13} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {columnTypeEntries().map(([value, config]) => {
                      const Icon = config.icon;
                      return (
                        <DropdownMenuItem
                          key={value}
                          onClick={() => onAddColumn?.(value)}
                        >
                          <Icon size={12} className="mr-2 opacity-60" />
                          {config.label}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
              cell: ({ row }: { row: { original: TableRowData } }) => (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  className="size-6 opacity-0 group-hover/tablerow:opacity-100"
                  onClick={() => onDeleteRow?.(row.original.id)}
                  title="Delete row"
                >
                  <TbTrash size={13} />
                </Button>
              ),
            } satisfies ColumnDef<TableRowData>,
          ]),
    ],
    [
      tableColumns,
      editingCell,
      readOnly,
      rowHeight,
      openCell,
      onCellChange,
      onAddColumn,
      onDeleteRow,
    ],
  );

  const table = useReactTable({
    data: visibleRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    columnResizeMode: "onChange",
    enableColumnResizing: !readOnly,
    defaultColumn: { size: 150, minSize: 80 },
    onColumnSizingChange: (updaterOrValue) => {
      setColumnSizing((prev) => {
        const next =
          typeof updaterOrValue === "function"
            ? updaterOrValue(prev)
            : updaterOrValue;
        for (const [colId, width] of Object.entries(next)) {
          if (prev[colId] !== width) {
            onColumnWidthChangeRef.current?.(colId, Math.round(width));
          }
        }
        return next;
      });
    },
    globalFilterFn,
    state: { sorting, globalFilter, columnOrder, columnSizing },
  });

  const sensors = useSensors(
    // Sans seuil d'activation, dnd-kit avale le clic sur les contrôles posés
    // dans l'en-tête et dans la gouttière.
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 6 },
    }),
    useSensor(KeyboardSensor, {}),
  );

  function handleColumnDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!active || !over || active.id === over.id) return;
    const ids = tableColumns.map((c) => c.id);
    const oldIndex = ids.indexOf(active.id as string);
    const newIndex = ids.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    onColumnOrderChange?.(arrayMove(ids, oldIndex, newIndex));
  }

  function handleRowDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!active || !over || active.id === over.id) return;
    const allIds = rows.map((r) => r.id);
    const oldIndex = allIds.indexOf(active.id as string);
    const newIndex = allIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    onRowOrderChange?.(arrayMove(allIds, oldIndex, newIndex));
  }

  const sortableColumnIds = useMemo(
    () => columnOrder.filter((id) => !isUtilityColumn(id)),
    [columnOrder],
  );

  const displayedRows = table.getRowModel().rows;
  const rowIds = useMemo(() => displayedRows.map((r) => r.id), [displayedRows]);
  const displayedRowData = useMemo(
    () => displayedRows.map((r) => r.original),
    [displayedRows],
  );

  useEffect(() => {
    if (recordRowId && !displayedRowData.some((r) => r.id === recordRowId)) {
      setRecordRowId(null);
    }
  }, [recordRowId, displayedRowData]);

  const optionsDialogColumn = optionsDialogColumnId
    ? columnsById.get(optionsDialogColumnId)
    : undefined;

  const leafColumns = table.getVisibleLeafColumns();
  const showGhostRow =
    !readOnly &&
    tableColumns.length > 0 &&
    globalFilter === "" &&
    filters.length === 0;
  const hasSummary = tableColumns.some((c) => c.summary);

  if (tableColumns.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-3 p-8 text-center",
          className,
        )}
      >
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? "This table has no columns."
            : "This table has no columns yet."}
        </p>
        {!readOnly && onAddColumn && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <TbPlus size={14} />
                Add a column
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center">
              {columnTypeEntries().map(([value, config]) => {
                const Icon = config.icon;
                return (
                  <DropdownMenuItem
                    key={value}
                    onClick={() => onAddColumn(value)}
                  >
                    <Icon size={12} className="mr-2 opacity-60" />
                    {config.label}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    );
  }

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis]}
      onDragEnd={handleColumnDragEnd}
      sensors={sensors}
    >
      <div
        ref={tableRootRef}
        tabIndex={-1}
        className={cn("flex flex-col outline-none", className)}
      >
        <TableToolbar
          columns={tableColumns}
          search={globalFilter}
          onSearchChange={setGlobalFilter}
          filters={filters}
          conjunction={conjunction}
          onFiltersChange={setFilters}
          onConjunctionChange={setConjunction}
          rowHeight={rowHeight}
          onRowHeightChange={onRowHeightChange}
          visibleRowCount={displayedRows.length}
          totalRowCount={rows.length}
          readOnly={readOnly}
        />

        <div className="min-h-0 flex-1 overflow-auto">
          <ShadcnTable
            style={{ tableLayout: "fixed", width: table.getTotalSize() }}
          >
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  <SortableContext
                    items={sortableColumnIds}
                    strategy={horizontalListSortingStrategy}
                  >
                    {headerGroup.headers.map((header) => {
                      if (isUtilityColumn(header.column.id)) {
                        return (
                          <TableHead
                            key={header.id}
                            style={{ width: header.getSize() }}
                            className="sticky top-0 z-20 bg-background"
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                          </TableHead>
                        );
                      }
                      return (
                        <DraggableHeader
                          key={header.id}
                          header={header}
                          canDrag={!readOnly}
                        >
                          {({ dragHandle }) => (
                            <ColHeader
                              col={columnsById.get(header.column.id)!}
                              tanstackCol={header.column}
                              readOnly={readOnly}
                              dragHandle={dragHandle}
                              lossyCountFor={(type) =>
                                countLossyCells(
                                  rows.map(
                                    (row) => row.cells[header.column.id] ?? null,
                                  ),
                                  columnsById.get(header.column.id)!,
                                  type,
                                )
                              }
                              onNameChange={(name) =>
                                onColumnNameChange?.(header.column.id, name)
                              }
                              onTypeChange={(type) =>
                                onColumnTypeChange?.(header.column.id, type)
                              }
                              onDelete={() => onDeleteColumn?.(header.column.id)}
                              onEditOptions={() =>
                                setOptionsDialogColumnId(header.column.id)
                              }
                            />
                          )}
                        </DraggableHeader>
                      );
                    })}
                  </SortableContext>
                </TableRow>
              ))}
            </TableHeader>
            <DndContext
              collisionDetection={closestCenter}
              modifiers={[restrictToVerticalAxis]}
              onDragEnd={handleRowDragEnd}
              sensors={sensors}
              // Sans ça, dnd-kit pose ses éléments d'accessibilité en <div>
              // enfants directs de <table> : du HTML invalide, que React
              // signale à chaque ouverture d'une table.
              accessibility={{ container: document.body }}
            >
              <TableBody>
                {displayedRows.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={leafColumns.length}
                      className="py-8 text-center text-sm text-muted-foreground"
                    >
                      {rows.length === 0
                        ? readOnly
                          ? "No rows."
                          : "No rows yet."
                        : "No row matches the current search or filters."}
                    </TableCell>
                  </TableRow>
                )}
                <SortableContext
                  items={rowIds}
                  strategy={verticalListSortingStrategy}
                >
                  {displayedRows.map((row, index) => (
                    <DraggableRow key={row.id} row={row} canDrag={canReorderRows}>
                      {({ attributes, listeners, setActivatorNodeRef }) => (
                        <SortableContext
                          items={sortableColumnIds}
                          strategy={horizontalListSortingStrategy}
                        >
                          {row.getVisibleCells().map((cell) => {
                            if (cell.column.id === GUTTER_COLUMN_ID) {
                              return (
                                <TableCell
                                  key={cell.id}
                                  style={{ width: GUTTER_WIDTH }}
                                  className="px-2 align-top"
                                >
                                  <RowGutter
                                    index={index}
                                    canDrag={canReorderRows}
                                    attributes={attributes}
                                    listeners={listeners}
                                    setActivatorNodeRef={setActivatorNodeRef}
                                    onExpand={() => setRecordRowId(row.id)}
                                  />
                                </TableCell>
                              );
                            }
                            if (cell.column.id === ACTIONS_COLUMN_ID) {
                              return (
                                <TableCell
                                  key={cell.id}
                                  style={{ width: cell.column.getSize() }}
                                  className="px-1 align-top"
                                >
                                  {flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext(),
                                  )}
                                </TableCell>
                              );
                            }
                            const cellColumn = columnsById.get(cell.column.id);
                            return (
                              <DraggableCell
                                key={cell.id}
                                cell={cell}
                                onCellClick={
                                  // La case à cocher garde sa propre cible :
                                  // basculer la valeur en cliquant n'importe où
                                  // dans la cellule serait trop facile à faire
                                  // par accident.
                                  readOnly || !cellColumn || cellColumn.type === "checkbox"
                                    ? undefined
                                    : () => openCell(row.original.id, cell.column.id)
                                }
                              >
                                {flexRender(
                                  cell.column.columnDef.cell,
                                  cell.getContext(),
                                )}
                              </DraggableCell>
                            );
                          })}
                        </SortableContext>
                      )}
                    </DraggableRow>
                  ))}
                </SortableContext>
                {showGhostRow && (
                  <GhostRow
                    leafColumns={leafColumns}
                    onCreate={createRowAndEdit}
                  />
                )}
              </TableBody>
            </DndContext>
            {(hasSummary || !readOnly) && (
              <SummaryFooter
                leafColumns={leafColumns}
                columnsById={columnsById}
                rows={displayedRowData}
                readOnly={readOnly || !onColumnSummaryChange}
                onSummaryChange={(colId, kind) =>
                  onColumnSummaryChange?.(colId, kind)
                }
              />
            )}
          </ShadcnTable>
        </div>
      </div>

      {optionsDialogColumn && (
        <SelectOptionsDialog
          open={true}
          columnName={optionsDialogColumn.name}
          options={optionsDialogColumn.options ?? []}
          isMulti={optionsDialogColumn.isMulti ?? false}
          onOpenChange={(open) => {
            if (!open) setOptionsDialogColumnId(null);
          }}
          onSave={(opts, isMulti) => {
            onColumnOptionsChange?.(optionsDialogColumn.id, opts, isMulti);
          }}
        />
      )}

      {recordRowId && (
        <RowRecordDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setRecordRowId(null);
          }}
          columns={tableColumns}
          rows={displayedRowData}
          rowId={recordRowId}
          readOnly={readOnly}
          onNavigate={setRecordRowId}
          onCellChange={(rowId, colId, value) =>
            onCellChange?.(rowId, colId, value)
          }
          onDeleteRow={(rowId) => onDeleteRow?.(rowId)}
          onEditColumnOptions={setOptionsDialogColumnId}
        />
      )}
    </DndContext>
  );
}
