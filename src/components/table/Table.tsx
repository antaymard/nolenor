import { type CSSProperties, useMemo, useRef, useState } from "react";
import type { IconType } from "react-icons";
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
import { Input } from "@/components/shadcn/input";
import { TbPlus, TbSearch, TbTrash } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { CellEditor } from "./CellEditor";
import { ColHeader } from "./ColHeader";
import { SelectOptionsDialog } from "./SelectOptionsDialog";
import type {
  CellValue,
  ColumnType,
  LinkCellValue,
  SelectOption,
  TableColumn,
  TableRowData,
} from "./types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { COLUMN_TYPE_CONFIG } from "./types";

export interface TableProps {
  columns: TableColumn[];
  rows: TableRowData[];
  readOnly?: boolean;
  onCellChange?: (rowId: string, colId: string, value: CellValue) => void;
  onAddRow?: () => void;
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
  className?: string;
}

interface EditingCell {
  rowId: string;
  columnId: string;
}

const globalFilterFn: FilterFn<TableRowData> = (row, columnId, filterValue) => {
  const value = row.getValue(columnId);
  if (value == null) return false;
  if (typeof value === "object" && "href" in (value as object)) {
    const link = value as LinkCellValue;
    const term = (filterValue as string).toLowerCase();
    return (
      (link.pageTitle?.toLowerCase().includes(term) ?? false) ||
      (link.href?.toLowerCase().includes(term) ?? false)
    );
  }
  return String(value)
    .toLowerCase()
    .includes((filterValue as string).toLowerCase());
};

function DraggableHeader({
  header,
  children,
}: {
  header: Header<TableRowData, unknown>;
  children: React.ReactNode;
}) {
  const { attributes, isDragging, listeners, setNodeRef, transform } =
    useSortable({ id: header.column.id });
  const isResizing = header.column.getIsResizing();
  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: "relative",
    transform: CSS.Translate.toString(transform),
    transition: isResizing
      ? "transform 0.2s ease-in-out"
      : "width transform 0.2s ease-in-out",
    zIndex: isDragging ? 1 : 0,
    width: header.getSize(),
    userSelect: isResizing ? "none" : undefined,
    overflow: "hidden",
  };
  return (
    <TableHead ref={setNodeRef} style={style}>
      <div className="flex items-center gap-1">
        <div className="flex-1 min-w-0">{children}</div>
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0 px-0.5"
          tabIndex={-1}
        >
          ⠿
        </button>
      </div>
      <div
        onMouseDown={header.getResizeHandler()}
        onTouchStart={header.getResizeHandler()}
        className={cn(
          "absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none hover:bg-border",
          isResizing && "bg-primary/60",
        )}
      />
    </TableHead>
  );
}

function DraggableCell({
  cell,
  children,
}: {
  cell: Cell<TableRowData, unknown>;
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
    <TableCell ref={setNodeRef} style={style}>
      {children}
    </TableCell>
  );
}

function RowDragHandle({
  attributes,
  listeners,
  setActivatorNodeRef,
}: {
  attributes: DraggableAttributes;
  listeners: SyntheticListenerMap | undefined;
  setActivatorNodeRef: (element: HTMLElement | null) => void;
}) {
  return (
    <button
      ref={setActivatorNodeRef}
      type="button"
      {...attributes}
      {...listeners}
      className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground px-0.5"
      tabIndex={-1}
    >
      ⠿
    </button>
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
  onCellChange,
  onDeleteRow,
  onAddColumn,
  onDeleteColumn,
  onColumnNameChange,
  onColumnTypeChange,
  onColumnOrderChange,
  onRowOrderChange,
  onColumnWidthChange,
  onColumnOptionsChange,
  className,
}: TableProps) {
  const tableRootRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [optionsDialogColumnId, setOptionsDialogColumnId] = useState<
    string | null
  >(null);
  const [columnOrder, setColumnOrder] = useState<string[]>(() => [
    ...(!readOnly ? ["__drag__"] : []),
    ...tableColumns.map((c) => c.id),
    ...(!readOnly ? ["__delete__"] : []),
  ]);
  const [columnSizing, setColumnSizing] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      tableColumns.filter((c) => c.width != null).map((c) => [c.id, c.width!]),
    ),
  );

  // Hide row drag handle when sorting or filtering is active (order becomes ambiguous)
  const canReorderRowsRef = useRef(true);
  canReorderRowsRef.current =
    !readOnly && sorting.length === 0 && globalFilter === "";

  const onColumnWidthChangeRef = useRef(onColumnWidthChange);
  onColumnWidthChangeRef.current = onColumnWidthChange;

  const columns = useMemo<ColumnDef<TableRowData>[]>(
    () => [
      ...(!readOnly
        ? [
            {
              id: "__drag__",
              size: 32,
              enableSorting: false,
              enableGlobalFilter: false,
              enableResizing: false,
              header: () => null,
              cell: () => null,
            } satisfies ColumnDef<TableRowData>,
          ]
        : []),
      ...tableColumns.map(
        (col): ColumnDef<TableRowData> => ({
          enableResizing: true,
          id: col.id,
          accessorFn: (row) => row.cells[col.id],
          header: ({ column: tanstackCol }) => (
            <ColHeader
              col={col}
              tanstackCol={tanstackCol}
              isEditing={editingColumnId === col.id}
              readOnly={readOnly}
              onEditStart={() => setEditingColumnId(col.id)}
              onEditEnd={() => {
                setEditingColumnId(null);
                tableRootRef.current?.focus();
              }}
              onNameChange={(name) => onColumnNameChange?.(col.id, name)}
              onTypeChange={(type) => onColumnTypeChange?.(col.id, type)}
              onDelete={() => onDeleteColumn?.(col.id)}
              onEditOptions={() => setOptionsDialogColumnId(col.id)}
            />
          ),
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
                onClick={() => {
                  if (readOnly) return;
                  if (col.type === "checkbox") {
                    onCellChange?.(row.original.id, col.id, !value);
                  } else if (
                    col.type === "select" &&
                    (!col.options || col.options.length === 0)
                  ) {
                    setOptionsDialogColumnId(col.id);
                  } else {
                    setEditingCell({
                      rowId: row.original.id,
                      columnId: col.id,
                    });
                  }
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
      ...(!readOnly
        ? [
            {
              id: "__delete__",
              size: 32,
              enableSorting: false,
              enableGlobalFilter: false,
              enableResizing: false,
              header: () => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-6 w-6">
                      <TbPlus size={13} />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(
                      Object.entries(COLUMN_TYPE_CONFIG) as [
                        ColumnType,
                        { label: string; icon: IconType },
                      ][]
                    ).map(([value, config]) => {
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
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6 opacity-0 group-hover/tablerow:opacity-100"
                  onClick={() => onDeleteRow?.(row.original.id)}
                >
                  <TbTrash size={13} />
                </Button>
              ),
            } satisfies ColumnDef<TableRowData>,
          ]
        : []),
    ],
    [
      tableColumns,
      editingCell,
      editingColumnId,
      readOnly,
      onCellChange,
      onAddColumn,
      onColumnNameChange,
      onColumnTypeChange,
      onDeleteColumn,
      onDeleteRow,
    ],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getRowId: (row) => row.id,
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onColumnOrderChange: setColumnOrder,
    columnResizeMode: "onChange",
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
    useSensor(MouseSensor, {}),
    useSensor(TouchSensor, {}),
    useSensor(KeyboardSensor, {}),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      setColumnOrder((order) => {
        const oldIndex = order.indexOf(active.id as string);
        const newIndex = order.indexOf(over.id as string);
        const newOrder = arrayMove(order, oldIndex, newIndex);
        onColumnOrderChange?.(newOrder);
        return newOrder;
      });
    }
  }

  function handleRowDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const allIds = rows.map((r) => r.id);
      const oldIndex = allIds.indexOf(active.id as string);
      const newIndex = allIds.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        onRowOrderChange?.(arrayMove(allIds, oldIndex, newIndex));
      }
    }
  }

  const rowIds = rows.map((r) => r.id);

  // Keep columnOrder in sync when columns are added/removed
  const prevColIds = useRef<string[]>(tableColumns.map((c) => c.id));
  const currentColIds = tableColumns.map((c) => c.id);
  const colIdsChanged =
    prevColIds.current.length !== currentColIds.length ||
    currentColIds.some((id) => !prevColIds.current.includes(id));
  if (colIdsChanged) {
    prevColIds.current = currentColIds;
    setColumnOrder([
      ...(!readOnly ? ["__drag__"] : []),
      ...currentColIds,
      ...(!readOnly ? ["__delete__"] : []),
    ]);
    const colIdSet = new Set(currentColIds);
    setColumnSizing((prev) => {
      const next: Record<string, number> = {};
      for (const col of tableColumns) {
        if (col.id in prev) next[col.id] = prev[col.id];
        else if (col.width != null) next[col.id] = col.width;
      }
      // Drop removed columns
      for (const key of Object.keys(prev)) {
        if (colIdSet.has(key) && !(key in next)) next[key] = prev[key];
      }
      return next;
    });
  }

  // IDs for column SortableContext — exclude utility columns
  const sortableIds = columnOrder.filter(
    (id) => id !== "__delete__" && id !== "__drag__",
  );

  const optionsDialogColumn = optionsDialogColumnId
    ? tableColumns.find((c) => c.id === optionsDialogColumnId)
    : undefined;

  return (
    <DndContext
      collisionDetection={closestCenter}
      modifiers={[restrictToHorizontalAxis]}
      onDragEnd={handleDragEnd}
      sensors={sensors}
    >
      <div
        ref={tableRootRef}
        tabIndex={-1}
        className={cn("flex flex-col outline-none", className)}
      >
        {tableColumns.length > 0 && (
          <div className="flex items-center gap-2 px-2 py-1.5 border-b shrink-0">
            <TbSearch size={14} className="text-muted-foreground shrink-0" />
            <Input
              placeholder="Search…"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="h-7 text-sm"
            />
          </div>
        )}
        <div className={cn("flex-1 overflow-auto", !readOnly && "pb-20")}>
          <ShadcnTable
            style={{ tableLayout: "fixed", width: table.getTotalSize() }}
          >
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  <SortableContext
                    items={sortableIds}
                    strategy={horizontalListSortingStrategy}
                  >
                    {headerGroup.headers.map((header) => {
                      if (header.column.id === "__drag__") {
                        return <TableHead key={header.id} className="w-8" />;
                      }
                      if (header.column.id === "__delete__") {
                        return (
                          <TableHead key={header.id} className="w-8">
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                          </TableHead>
                        );
                      }
                      return (
                        <DraggableHeader key={header.id} header={header}>
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
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
            >
              <TableBody>
                {table.getRowModel().rows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={
                        tableColumns.length +
                        (readOnly ? 0 : 2) /* drag + delete */
                      }
                      className="text-center text-muted-foreground py-10"
                    >
                      {readOnly
                        ? "No rows."
                        : 'No rows yet. Click "Add row" to get started.'}
                    </TableCell>
                  </TableRow>
                ) : (
                  <SortableContext
                    items={rowIds}
                    strategy={verticalListSortingStrategy}
                  >
                    {table.getRowModel().rows.map((row) => (
                      <DraggableRow
                        key={row.id}
                        row={row}
                        canDrag={canReorderRowsRef.current}
                      >
                        {({ attributes, listeners, setActivatorNodeRef }) => (
                          <SortableContext
                            items={sortableIds}
                            strategy={horizontalListSortingStrategy}
                          >
                            {row.getVisibleCells().map((cell) => {
                              if (
                                cell.column.id === "__delete__" ||
                                cell.column.id === "__drag__"
                              ) {
                                return (
                                  <TableCell key={cell.id} className="w-8 px-1">
                                    {cell.column.id === "__drag__" &&
                                    canReorderRowsRef.current ? (
                                      <RowDragHandle
                                        attributes={attributes}
                                        listeners={listeners}
                                        setActivatorNodeRef={
                                          setActivatorNodeRef
                                        }
                                      />
                                    ) : (
                                      flexRender(
                                        cell.column.columnDef.cell,
                                        cell.getContext(),
                                      )
                                    )}
                                  </TableCell>
                                );
                              }
                              return (
                                <DraggableCell key={cell.id} cell={cell}>
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
                )}
              </TableBody>
            </DndContext>
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
    </DndContext>
  );
}
