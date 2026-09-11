import { memo, useCallback, useMemo, useRef } from "react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import NodeFrame from "../NodeFrame";
import { Button } from "@/components/shadcn/button";
import { TbMaximize, TbTable } from "react-icons/tb";
import { useWindowsStore } from "@/stores/windowsStore";
import { useNoWheelUnlessZoom } from "@/hooks/useNoWheelUnlessZoom";
import { applyFilters, TablePreview } from "@/components/table";
import NodeEmptyState from "../NodeEmptyState";
import type { TableData } from "@/components/table";
import type { XyNodeProps } from "@/types/domain";

function TableNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const values = useNodeDataValues(nodeDataId);
  const tableTitle = useNodeDataTitle(nodeDataId) ?? "Table";
  const openWindow = useWindowsStore((s) => s.openWindow);

  const handleOpenWindow = useCallback(() => {
    if (!nodeDataId) return;
    openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "table" });
  }, [nodeDataId, openWindow, xyNode.id]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useNoWheelUnlessZoom(scrollRef);

  const tableData = (values?.table as TableData | undefined) ?? {
    columns: [],
    rows: [],
  };
  /*
   * Un filtre décrit une VUE de la table, pas une lecture jetable : le node
   * montre donc les mêmes lignes que la fenêtre d'édition. `applyFilters`
   * ignore de lui-même les conditions dont la colonne n'a pas survécu.
   */
  const visibleRows = useMemo(
    () =>
      applyFilters(
        tableData.rows,
        tableData.columns,
        tableData.filters ?? [],
        tableData.filterConjunction ?? "all",
      ),
    [
      tableData.rows,
      tableData.columns,
      tableData.filters,
      tableData.filterConjunction,
    ],
  );
  const hiddenRowCount = tableData.rows.length - visibleRows.length;
  const title = (values?.title as string | undefined) ?? "";
  const isTitleVariant = xyNode.data.variant === "title";
  const isTableEmpty =
    tableData.columns.length === 0 && tableData.rows.length === 0;

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        <Button
          size="icon"
          variant="outline"
          disabled={!nodeDataId}
          onClick={handleOpenWindow}
        >
          <TbMaximize />
        </Button>
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode} resizable={!isTitleVariant}>
        {isTitleVariant ? (
          <div className="flex items-center gap-2 px-2 min-w-0 h-full relative">
            <TbTable size={18} className="shrink-0" />
            <p className="truncate flex-1 min-w-0" title={tableTitle}>
              {tableTitle}
            </p>
          </div>
        ) : (
          <div className="flex flex-col h-full min-h-0 bg-background/50">
            {title && (
              <div className="shrink-0 pt-1.5 pb-0.5 px-2 bg-background z-20">
                <p className="font-semibold truncate text-lg">{title}</p>
              </div>
            )}
            <div
              ref={scrollRef}
              // `overscroll-x-none` : coupe le chaînage vers le "back"
              // navigateur au bord horizontal, sans bloquer le scroll interne.
              className="flex-1 min-h-0 overflow-auto overscroll-x-none relative"
            >
              {isTableEmpty ? (
                <NodeEmptyState icon={<TbTable size={22} />} action="double-click" />
              ) : (
                <TablePreview
                  columns={tableData.columns}
                  rows={visibleRows}
                  rowHeight={tableData.rowHeight}
                />
              )}
            </div>
            {hiddenRowCount > 0 && (
              <div className="shrink-0 border-t border-border bg-background px-2 py-0.5 text-right text-xs text-muted-foreground">
                {visibleRows.length} of {tableData.rows.length}
              </div>
            )}
          </div>
        )}
      </NodeFrame>
    </>
  );
}

export default memo(TableNode, areNodePropsEqual);
