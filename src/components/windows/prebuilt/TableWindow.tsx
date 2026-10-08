import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useNodeData } from "@/hooks/useNodeData";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { TableOp } from "@/../convex/schemas/tableOpsSchema";
import {
  applyTableOps,
  diffMoves,
  readStoredTable,
} from "@/../convex/lib/tableOps";
import { useWindowFrameContext } from "@/components/windows/WindowFrameContext";
import { TableMetadataPanel } from "@/components/windows/side-panel/TableMetadataPanel";
import { revealElement } from "@/lib/revealElement";
import { toastError } from "@/components/utils/errorUtils";
import toast from "react-hot-toast";
import InlineEditableText from "@/components/form-ui/InlineEditableText";
import { Button } from "@/components/shadcn/button";
import { TbDownload, TbUpload } from "react-icons/tb";
import {
  DEFAULT_ROW_HEIGHT,
  Table,
  TableImportDialog,
  buildCsv,
  downloadCsv,
  type TableImportResult,
} from "@/components/table";
import type {
  TableColumn,
  TableRowData,
  CellValue,
  ColumnType,
  FilterConjunction,
  RowHeight,
  SelectOption,
  SummaryKind,
  TableFilter,
  TableSort,
} from "@/components/table";
import WindowLoadingState from "@/components/windows/WindowLoadingState";
import { generateColumnId, generateLlmId } from "@/../convex/lib/llmId";

const NO_FILTERS: TableFilter[] = [];
const NO_SORTING: TableSort[] = [];

// Une largeur de colonne bouge à chaque pixel du redimensionnement : la grille
// l'affiche en local, on n'envoie que la dernière.
const COLUMN_WIDTH_SEND_DELAY_MS = 400;

const EMPTY_TABLE_STATE = { table: readStoredTable(undefined), title: "" };

/**
 * Table en édition à plusieurs, sans bouton Save : chaque geste part aussitôt
 * en opérations (cf. `convex/tableOps.ts`), appliquées par le serveur à l'état
 * courant — une cellule écrite par quelqu'un d'autre, ou par l'agent, pendant
 * qu'on édite la sienne n'est pas écrasée. La même application tourne en
 * local, en mise à jour optimiste du cache Convex : l'écran suit le geste sans
 * attendre l'aller-retour, et le serveur a le dernier mot.
 *
 * Seule la saisie de la cellule ouverte reste locale jusqu'à sa validation
 * (Entrée, clic ailleurs), pour qu'un filtre ne fasse pas disparaître la ligne
 * en pleine frappe.
 */
function TableWindow({ nodeDataId }: { nodeDataId: Id<"nodeDatas"> }) {
  const { setDirty, setSaveHandler, setPlanTabContent } =
    useWindowFrameContext();
  const nodeData = useNodeData(nodeDataId);
  const isLocked = false;

  // `values` est un `v.record(v.string(), v.any())` : rien ne garantit la
  // forme de `table`, `readStoredTable` en rend toujours une lisible.
  const { table, title } = useMemo(() => {
    if (!nodeData) return EMPTY_TABLE_STATE;
    return {
      table: readStoredTable(nodeData.values?.table),
      title:
        typeof nodeData.values?.title === "string" ? nodeData.values.title : "",
    };
  }, [nodeData]);
  const columns = table.columns as TableColumn[];
  const rows = table.rows as TableRowData[];
  const rowHeight =
    (table.rowHeight as RowHeight | undefined) ?? DEFAULT_ROW_HEIGHT;
  const filters = (table.filters as TableFilter[] | undefined) ?? NO_FILTERS;
  const filterConjunction: FilterConjunction =
    table.filterConjunction === "any" ? "any" : "all";
  const sorting = (table.sorting as TableSort[] | undefined) ?? NO_SORTING;

  // Lus par les callbacks, qui restent ainsi stables d'un rendu à l'autre.
  const columnsRef = useRef(columns);
  const rowsRef = useRef(rows);
  const titleRef = useRef(title);
  columnsRef.current = columns;
  rowsRef.current = rows;
  titleRef.current = title;

  // Rien à sauvegarder : tout part au fil de l'eau.
  useEffect(() => {
    setDirty(false);
    setSaveHandler(null);
  }, [setDirty, setSaveHandler]);

  const canvasId = nodeData?.canvasId;
  const applyMutation = useMutation(api.tableOps.apply);
  // Mémoïsée : `withOptimisticUpdate` rend une fonction neuve à chaque appel.
  const applyOps = useMemo(
    () =>
      applyMutation.withOptimisticUpdate((localStore, args) => {
        if (!canvasId) return;
        const list = localStore.getQuery(api.nodeDatas.listByCanvasId, {
          canvasId,
        });
        if (list === undefined) return;
        localStore.setQuery(
          api.nodeDatas.listByCanvasId,
          { canvasId },
          list.map((doc) => {
            if (doc._id !== args.nodeDataId) return doc;
            const next = applyTableOps(
              {
                table: readStoredTable(doc.values?.table),
                title:
                  typeof doc.values?.title === "string" ? doc.values.title : "",
              },
              args.ops,
            );
            return {
              ...doc,
              values: { ...doc.values, table: next.table, title: next.title },
              // Le nodeDataStore ne remplace un doc que si `updatedAt` change.
              updatedAt: Date.now(),
            };
          }),
        );
      }),
    [applyMutation, canvasId],
  );

  const send = useCallback(
    (ops: TableOp[]) => {
      if (ops.length === 0) return;
      // Convex exécute les mutations d'un client dans l'ordre d'envoi : deux
      // gestes enchaînés arrivent dans l'ordre où ils ont été faits.
      applyOps({ nodeDataId, ops }).catch((error: unknown) => {
        toastError(error, "Error updating the table");
      });
    },
    [applyOps, nodeDataId],
  );

  // Résultat de recherche du panel : la ligne est repérée par son
  // `data-row-id` (posé par `DraggableRow`). Absente du DOM, c'est que la
  // recherche ou les filtres de la table la masquent.
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const revealRow = useCallback((rowId: string) => {
    const row = Array.from(
      tableContainerRef.current?.querySelectorAll<HTMLElement>(
        "[data-row-id]",
      ) ?? [],
    ).find((el) => el.dataset.rowId === rowId);
    if (row) revealElement(row);
    else toast("This row is hidden by the table's search or filters.");
  }, []);

  useEffect(() => {
    setPlanTabContent(
      <TableMetadataPanel
        columns={columns}
        rows={rows}
        onSelectRow={revealRow}
      />,
    );
    return () => setPlanTabContent(null);
  }, [columns, rows, revealRow, setPlanTabContent]);

  // Publie le brouillon de la cellule ouverte (cf. `Table.flushEditsRef`).
  const flushEditsRef = useRef<(() => void) | null>(null);

  // Largeurs en attente d'envoi (cf. COLUMN_WIDTH_SEND_DELAY_MS).
  const pendingWidthsRef = useRef(new Map<string, number>());
  const widthTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendPendingWidths = useCallback(() => {
    if (widthTimerRef.current) clearTimeout(widthTimerRef.current);
    widthTimerRef.current = null;
    const pending = [...pendingWidthsRef.current];
    pendingWidthsRef.current.clear();
    send(
      pending.map(([columnId, width]) => ({
        kind: "updateColumn",
        columnId,
        patch: { width },
      })),
    );
  }, [send]);

  // Fermer la window ne perd ni la saisie en cours ni une largeur en attente.
  // Les nettoyages d'effets d'un arbre démonté passent du parent aux enfants :
  // l'éditeur de cellule n'a pas encore retiré son `flush`.
  const flushOnCloseRef = useRef(() => {});
  flushOnCloseRef.current = () => {
    flushEditsRef.current?.();
    sendPendingWidths();
  };
  useEffect(() => () => flushOnCloseRef.current(), []);

  // --- Column management ---

  const addColumn = useCallback(
    (type: ColumnType = "text") => {
      send([
        {
          kind: "addColumn",
          column: {
            id: generateColumnId(),
            name: `Column ${columnsRef.current.length + 1}`,
            type,
          },
        },
      ]);
    },
    [send],
  );

  const deleteColumn = useCallback(
    (colId: string) => send([{ kind: "deleteColumns", columnIds: [colId] }]),
    [send],
  );

  const updateColumnName = useCallback(
    (colId: string, name: string) =>
      send([{ kind: "updateColumn", columnId: colId, patch: { name } }]),
    [send],
  );

  // La conversion des cellules est faite par le serveur, sur l'état courant
  // (cf. `coerceCellValue`) ; le menu de colonne annonce combien de cellules
  // elle effacera avant qu'on la déclenche.
  const updateColumnType = useCallback(
    (colId: string, type: ColumnType) =>
      send([{ kind: "updateColumn", columnId: colId, patch: { type } }]),
    [send],
  );

  // --- Row management ---

  // Renvoie l'id : la ligne fantôme de la grille enchaîne dessus pour ouvrir
  // l'éditeur de la cellule sur laquelle l'utilisateur vient de cliquer.
  const addRow = useCallback((): string => {
    const id = generateLlmId();
    send([{ kind: "insertRows", rows: [{ id, cells: {} }], position: "end" }]);
    return id;
  }, [send]);

  const deleteRow = useCallback(
    (rowId: string) => send([{ kind: "deleteRows", rowIds: [rowId] }]),
    [send],
  );

  const updateCell = useCallback(
    (rowId: string, colId: string, value: CellValue) => {
      const column = columnsRef.current.find((c) => c.id === colId);
      send([
        {
          kind: "setCells",
          cells: [{ rowId, columnId: colId, value, columnType: column?.type }],
        },
      ]);
    },
    [send],
  );

  // La grille rend l'ordre complet ; on n'en envoie que le déplacement, pour
  // ne pas effacer une ligne insérée par quelqu'un d'autre entre-temps.
  const reorderRows = useCallback(
    (orderedIds: string[]) =>
      send(
        diffMoves(
          rowsRef.current.map((r) => r.id),
          orderedIds,
        ).map(({ id, beforeId }) => ({
          kind: "moveRow",
          rowId: id,
          beforeRowId: beforeId,
        })),
      ),
    [send],
  );

  const reorderColumns = useCallback(
    (orderedIds: string[]) =>
      send(
        diffMoves(
          columnsRef.current.map((c) => c.id),
          orderedIds,
        ).map(({ id, beforeId }) => ({
          kind: "moveColumn",
          columnId: id,
          beforeColumnId: beforeId,
        })),
      ),
    [send],
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
        send([
          { kind: "replaceAll", columns: result.columns, rows: result.rows },
        ]);
        return;
      }
      // Ajout : les colonnes nouvelles, puis les lignes en fin de table (les
      // cellules des colonnes qu'elles n'ont pas valent `null`).
      const existingIds = new Set(columnsRef.current.map((c) => c.id));
      send([
        ...result.columns
          .filter((column) => !existingIds.has(column.id))
          .map((column) => ({ kind: "addColumn" as const, column })),
        { kind: "insertRows", rows: result.rows, position: "end" },
      ]);
    },
    [send],
  );

  const updateColumnWidth = useCallback(
    (colId: string, width: number) => {
      const current = columnsRef.current.find((c) => c.id === colId);
      if (current?.width === width && !pendingWidthsRef.current.has(colId)) {
        return;
      }
      pendingWidthsRef.current.set(colId, width);
      if (widthTimerRef.current) clearTimeout(widthTimerRef.current);
      widthTimerRef.current = setTimeout(
        sendPendingWidths,
        COLUMN_WIDTH_SEND_DELAY_MS,
      );
    },
    [sendPendingWidths],
  );

  const updateColumnSummary = useCallback(
    (colId: string, summary: SummaryKind | undefined) =>
      send([
        {
          kind: "updateColumn",
          columnId: colId,
          patch: { summary: summary ?? null },
        },
      ]),
    [send],
  );

  // Hauteur de ligne, filtres et tri décrivent la VUE de la table, partagée :
  // le node du canvas les applique aussi, et tous les éditeurs voient la même.
  const updateRowHeight = useCallback(
    (next: RowHeight) => send([{ kind: "setView", view: { rowHeight: next } }]),
    [send],
  );

  const updateFilters = useCallback(
    (next: TableFilter[]) =>
      send([{ kind: "setView", view: { filters: next } }]),
    [send],
  );

  const updateFilterConjunction = useCallback(
    (next: FilterConjunction) =>
      send([{ kind: "setView", view: { filterConjunction: next } }]),
    [send],
  );

  const updateSorting = useCallback(
    (next: TableSort[]) => send([{ kind: "setView", view: { sorting: next } }]),
    [send],
  );

  // Les cellules qui pointent vers une option supprimée la perdent côté
  // serveur, sur l'état courant (cf. `updateColumn` dans tableOps).
  const updateColumnOptions = useCallback(
    (colId: string, options: SelectOption[], isMulti: boolean) =>
      send([
        { kind: "updateColumn", columnId: colId, patch: { options, isMulti } },
      ]),
    [send],
  );

  const updateTitle = useCallback(
    (next: string) => {
      if (next !== titleRef.current) send([{ kind: "setTitle", title: next }]);
    },
    [send],
  );

  if (!nodeData) return <WindowLoadingState />;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 border-b shrink-0">
        <InlineEditableText
          value={title}
          onSave={updateTitle}
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
          disabled={columns.length === 0}
          title="Export in CSV"
        >
          <TbDownload size={14} className="mr-1" />
          Export
        </Button>
      </div>
      <TableImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        existingColumns={columns}
        hasExistingData={rows.length > 0 || columns.length > 0}
        onImport={handleImport}
      />

      <div ref={tableContainerRef} className="relative flex-1 min-h-0">
        <Table
          columns={columns}
          rows={rows}
          readOnly={isLocked}
          rowHeight={rowHeight}
          filters={filters}
          filterConjunction={filterConjunction}
          onFiltersChange={updateFilters}
          onFilterConjunctionChange={updateFilterConjunction}
          sorting={sorting}
          onSortingChange={updateSorting}
          onCellChange={updateCell}
          flushEditsRef={flushEditsRef}
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
