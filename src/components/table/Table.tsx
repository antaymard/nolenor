import {
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
  type ColumnDef,
  type FilterFn,
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
  type CollisionDetection,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  restrictToHorizontalAxis,
  restrictToVerticalAxis,
} from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/table";
import { Button } from "@/components/shadcn/button";
import {
  TbPlus,
  TbTrash,
} from "react-icons/tb";
import { cn } from "@/lib/utils";
import { AddColumnMenu } from "./AddColumnMenu";
import { CellEditor } from "./CellEditor";
import {
  DraggableCell,
  DraggableHeader,
  DraggableRow,
  RowGutter,
} from "./sortableParts";
import { ColHeader } from "./ColHeader";
import { GhostRow } from "./GhostRow";
import { RowRecordDialog } from "./RowRecordDialog";
import { SelectOptionsDialog } from "./SelectOptionsDialog";
import { SummaryFooter } from "./SummaryFooter";
import { TableToolbar } from "./TableToolbar";
import { ACTIONS_COLUMN_ID, GUTTER_COLUMN_ID, isUtilityColumn } from "./columnIds";
import { countLossyCells } from "./coerce";
import { cellText } from "./cellText";
import { applyFilters, type FilterConjunction, type TableFilter } from "./filters";
import {
  DEFAULT_ROW_HEIGHT,
  type CellValue,
  type ColumnType,
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
  /**
   * La fiche de ligne retient l'ORDRE des lignes tel qu'il était à son
   * ouverture. Naviguer suit donc le tri et le filtre affichés, mais éditer un
   * champ qui ferait sortir la ligne de ce filtre ne referme plus la fiche au
   * milieu de la saisie.
   */
  const [record, setRecord] = useState<{
    rowId: string;
    rowIds: string[];
  } | null>(null);
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

  /*
   * La recherche lit la cellule PAR SON TYPE plutôt que de le deviner à la
   * forme de la valeur. L'ancienne version reniflait le rich text avec
   * `startsWith("[{")` et retombait sur `String(value)` : une colonne select
   * cherchait dans les UUID de ses options, une colonne node dans
   * « [object Object] », et une cellule rich text VIDE faisait matcher toutes
   * les lignes dès qu'on tapait « default » ou « left » — les clés du JSON.
   */
  const globalFilterFn = useMemo<FilterFn<TableRowData>>(
    () => (row, columnId, filterValue) => {
      const column = columnsById.get(columnId);
      if (!column) return false;
      const term = String(filterValue).toLowerCase();
      return cellText(row.getValue(columnId), column).toLowerCase().includes(term);
    },
    [columnsById],
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
      setGlobalFilter("");
      setFilters([]);
      setSorting([]);
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
          // Sans ça, trier une colonne rich text comparait le document
          // sérialisé, dont les 30 premiers caractères sont un identifiant de
          // bloc aléatoire : l'ordre obtenu n'avait aucun rapport avec le texte
          // affiché.
          sortingFn: (a, b) =>
            cellText(a.original.cells[col.id] ?? null, col).localeCompare(
              cellText(b.original.cells[col.id] ?? null, col),
              undefined,
              { numeric: true, sensitivity: "base" },
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
                rowHeight={rowHeight}
                // Les cases à cocher basculent par `onCheckedChange` et
                // n'appellent jamais ce `onClick`.
                onClick={() => openCell(row.original.id, col.id)}
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
                <AddColumnMenu onAddColumn={(type) => onAddColumn?.(type)} />
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

  /*
   * Les cellules du corps s'enregistrent comme sortables sous l'id de LEUR
   * COLONNE (c'est ce qui les fait suivre un déplacement de colonne), mais elles
   * sont rendues dans le DndContext des LIGNES. Sans filtre, `closestCenter`
   * peut donc rendre un id de colonne comme cible pendant qu'on déplace une
   * ligne : `handleRowDragEnd` l'ignore, et le dépôt ne fait rien — surtout près
   * du bas du tableau. On ne laisse au calcul de collision que les lignes.
   */
  const rowCollisionDetection = useMemo<CollisionDetection>(() => {
    const ids = new Set(rowIds);
    return (args) =>
      closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter((container) =>
          ids.has(String(container.id)),
        ),
      });
  }, [rowIds]);
  const displayedRowData = useMemo(
    () => displayedRows.map((r) => r.original),
    [displayedRows],
  );

  // Recomposée depuis les lignes VIVES, pour que les éditions se voient, mais
  // dans l'ordre figé à l'ouverture.
  const recordRows = useMemo(() => {
    if (!record) return [];
    const byId = new Map(rows.map((r) => [r.id, r]));
    return record.rowIds.flatMap((id) => {
      const row = byId.get(id);
      return row ? [row] : [];
    });
  }, [record, rows]);

  // Seule la suppression referme la fiche.
  useEffect(() => {
    if (record && !rows.some((r) => r.id === record.rowId)) setRecord(null);
  }, [record, rows]);

  // `applyFilters` ignore déjà les filtres dont la colonne n'existe plus, mais
  // `canReorderRows` et `showGhostRow` comptaient les conditions, pas leur effet :
  // supprimer une colonne filtrée laissait la grille sans ligne fantôme et sans
  // réordonnancement, avec un compteur qui annonçait « non filtré ».
  useEffect(() => {
    setFilters((prev) => {
      const alive = prev.filter((f) => columnsById.has(f.columnId));
      return alive.length === prev.length ? prev : alive;
    });
  }, [columnsById]);

  useEffect(() => {
    if (optionsDialogColumnId && !columnsById.has(optionsDialogColumnId)) {
      setOptionsDialogColumnId(null);
    }
  }, [optionsDialogColumnId, columnsById]);

  const optionsDialogColumn = optionsDialogColumnId
    ? columnsById.get(optionsDialogColumnId)
    : undefined;

  const leafColumns = table.getVisibleLeafColumns();
  // La ligne fantôme reste visible sous recherche, filtre ou tri : c'est le seul
  // moyen d'ajouter une ligne, et la masquer transformait « je ne trouve pas,
  // donc je l'ajoute » en impasse. Comme une ligne vide ne passerait aucun
  // filtre et se rangerait n'importe où sous un tri, le clic remet la vue à plat
  // avant de créer, pour que la ligne créée soit celle qu'on voit.
  const showGhostRow = !readOnly && tableColumns.length > 0;
  const viewIsNarrowed =
    globalFilter !== "" || filters.length > 0 || sorting.length > 0;
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
          <AddColumnMenu align="center" onAddColumn={onAddColumn}>
            <Button size="sm" variant="outline">
              <TbPlus size={14} />
              Add a column
            </Button>
          </AddColumnMenu>
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

        {/*
          `<table>` nu, et non le `Table` de shadcn : celui-ci s'enveloppe dans
          un `<div className="overflow-x-auto">`, et `overflow-x: auto` force
          `overflow-y` à calculer `auto`. Ce wrapper devenait donc le scrollport
          le plus proche des `sticky` de l'en-tête et du pied — un scrollport à
          la hauteur de son contenu, qui ne défile jamais, pendant que le div
          extérieur défilait. Résultat : passé une quinzaine de lignes,
          l'en-tête s'en allait.
        */}
        <div className="min-h-0 flex-1 overflow-auto">
          <table
            className="w-full caption-bottom"
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
              collisionDetection={rowCollisionDetection}
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
                                    onExpand={() =>
                                      setRecord({
                                        rowId: row.id,
                                        rowIds: displayedRowData.map((r) => r.id),
                                      })
                                    }
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
                  <SortableContext
                    items={sortableColumnIds}
                    strategy={horizontalListSortingStrategy}
                  >
                    <GhostRow
                      leafColumns={leafColumns}
                      clearsView={viewIsNarrowed}
                      onCreate={createRowAndEdit}
                    />
                  </SortableContext>
                )}
              </TableBody>
            </DndContext>
            {(hasSummary || !readOnly) && (
              <SortableContext
                items={sortableColumnIds}
                strategy={horizontalListSortingStrategy}
              >
                <SummaryFooter
                  leafColumns={leafColumns}
                  columnsById={columnsById}
                  rows={displayedRowData}
                  readOnly={readOnly || !onColumnSummaryChange}
                  onSummaryChange={(colId, kind) =>
                    onColumnSummaryChange?.(colId, kind)
                  }
                />
              </SortableContext>
            )}
          </table>
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

      {record && (
        <RowRecordDialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setRecord(null);
          }}
          columns={tableColumns}
          rows={recordRows}
          rowId={record.rowId}
          readOnly={readOnly}
          onNavigate={(rowId) =>
            setRecord((current) => (current ? { ...current, rowId } : current))
          }
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
