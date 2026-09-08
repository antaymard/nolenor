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
  type DragStartEvent,
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
  /**
   * Filtres persistés, contrôlés par le parent — comme `rowHeight`. Le tri et la
   * recherche restent locaux : eux ne sont pas enregistrés avec la table.
   */
  filters?: TableFilter[];
  filterConjunction?: FilterConjunction;
  onFiltersChange?: (filters: TableFilter[]) => void;
  onFilterConjunctionChange?: (conjunction: FilterConjunction) => void;
  className?: string;
}

interface EditingCell {
  rowId: string;
  columnId: string;
}

const GUTTER_WIDTH = 56;

/**
 * Constantes de module : un littéral passé à `modifiers` est un nouveau tableau
 * à chaque rendu, que dnd-kit relit à chaque frame de déplacement.
 */
const ROW_MODIFIERS = [restrictToVerticalAxis];
const COLUMN_MODIFIERS = [restrictToHorizontalAxis];

/** Ce qu'on déplace. Posé par le `data` des sortables, dans `sortableParts`. */
type DragKind = "row" | "column";

/** Défaut stable : `filters` entre dans des `useMemo`. */
const NO_FILTERS: TableFilter[] = [];

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
  filters = NO_FILTERS,
  filterConjunction = "all",
  onFiltersChange,
  onFilterConjunctionChange,
  className,
}: TableProps) {
  const tableRootRef = useRef<HTMLDivElement>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
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

  /*
   * Sous filtre, l'ordre affiché est un SOUS-ENSEMBLE de l'ordre stocké : les
   * lignes visibles s'y suivent dans le même sens, donc un déplacement reste
   * traduisible en position absolue (cf. `handleRowDragEnd`). Sous tri ou sous
   * recherche, non : la position affichée ne dit plus rien de la position
   * stockée, et déposer entre deux lignes n'aurait pas de cible.
   */
  const canReorderRows = !readOnly && sorting.length === 0 && globalFilter === "";
  const reorderBlockedReason =
    readOnly || canReorderRows
      ? undefined
      : sorting.length > 0
        ? "Clear the sort to reorder rows"
        : "Clear the search to reorder rows";

  const onColumnWidthChangeRef = useRef(onColumnWidthChange);
  onColumnWidthChangeRef.current = onColumnWidthChange;

  const visibleRows = useMemo(
    () => applyFilters(rows, tableColumns, filters, filterConjunction),
    [rows, tableColumns, filters, filterConjunction],
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
      setSorting([]);
      // Une ligne vide ne passe aucun filtre : on remet la vue à plat pour que
      // la ligne créée soit celle qu'on voit. `GhostRow` l'annonce avant le clic.
      if (filters.length > 0) onFiltersChange?.([]);
      const col = columnsById.get(columnId);
      if (col && col.type !== "checkbox") {
        setEditingCell({ rowId: newRowId, columnId });
      }
    },
    [columnsById, onAddRow, filters, onFiltersChange],
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

  /*
   * `over` est une ligne VISIBLE. On traduit le dépôt en position absolue dans
   * le tableau complet, pour que les lignes masquées par un filtre gardent la
   * leur. Sans filtre, le calcul redonne exactement `arrayMove`.
   */
  function handleRowDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!active || !over || active.id === over.id) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    const visibleIds = visibleRows.map((r) => r.id);
    const from = visibleIds.indexOf(activeId);
    const to = visibleIds.indexOf(overId);
    if (from === -1 || to === -1) return;

    const next = rows.map((r) => r.id).filter((id) => id !== activeId);
    const target = next.indexOf(overId);
    if (target === -1) return;
    // Vers le bas on se pose APRÈS la cible, vers le haut avant elle.
    next.splice(from < to ? target + 1 : target, 0, activeId);
    onRowOrderChange?.(next);
  }

  /*
   * UN SEUL DndContext pour les colonnes ET les lignes.
   *
   * Il y en avait deux, imbriqués, partageant le même tableau de `sensors` — et
   * les cellules du corps, de la ligne fantôme et du pied s'enregistraient comme
   * sortables sous l'id de LEUR COLONNE, donc une fois par ligne. dnd-kit
   * indexant draggables et droppables par id dans des `Map`, le même id était
   * réécrit N fois et le pied écrasait jusqu'à l'enregistrement de l'en-tête. Le
   * drag de ligne n'y survivait pas. Seuls l'en-tête et la ligne s'enregistrent
   * maintenant, et `data.type` dit lequel des deux on déplace.
   */
  const [dragKind, setDragKind] = useState<DragKind | null>(null);
  // `modifiers` ne se relit qu'au rendu, d'où l'état ; `onDragEnd` ne doit pas
  // dépendre de l'ordre des mises à jour d'état, d'où la ref.
  const dragKindRef = useRef<DragKind | null>(null);
  dragKindRef.current = dragKind;

  // Ne laisse au calcul de collision que les cibles du type qu'on déplace.
  const collisionDetection = useCallback<CollisionDetection>(
    (args) =>
      closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (container) => container.data.current?.type === dragKindRef.current,
        ),
      }),
    [],
  );

  function handleDragStart(event: DragStartEvent) {
    const kind = event.active.data.current?.type;
    const next = kind === "row" || kind === "column" ? kind : null;
    // Écrit tout de suite, pas seulement au prochain rendu : `collisionDetection`
    // le lit dès le premier `mousemove`, avant que le rendu déclenché par
    // `setDragKind` n'ait été appliqué.
    dragKindRef.current = next;
    setDragKind(next);
  }

  function handleDragEnd(event: DragEndEvent) {
    if (dragKindRef.current === "row") handleRowDragEnd(event);
    else if (dragKindRef.current === "column") handleColumnDragEnd(event);
    setDragKind(null);
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
    const alive = filters.filter((f) => columnsById.has(f.columnId));
    if (alive.length !== filters.length) onFiltersChange?.(alive);
  }, [columnsById, filters, onFiltersChange]);

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
      collisionDetection={collisionDetection}
      modifiers={dragKind === "row" ? ROW_MODIFIERS : COLUMN_MODIFIERS}
      onDragStart={handleDragStart}
      onDragCancel={() => setDragKind(null)}
      onDragEnd={handleDragEnd}
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
          conjunction={filterConjunction}
          onFiltersChange={(next) => onFiltersChange?.(next)}
          onConjunctionChange={(next) => onFilterConjunctionChange?.(next)}
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
                      <>
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
                                  disabledReason={reorderBlockedReason}
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
                      </>
                    )}
                  </DraggableRow>
                ))}
              </SortableContext>
              {showGhostRow && (
                <GhostRow
                  leafColumns={leafColumns}
                  clearsView={viewIsNarrowed}
                  onCreate={createRowAndEdit}
                />
              )}
            </TableBody>
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
