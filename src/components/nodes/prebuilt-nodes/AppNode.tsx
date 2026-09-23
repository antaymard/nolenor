import { memo, useCallback, useState } from "react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useWindowsStore } from "@/stores/windowsStore";
import NodeFrame from "../NodeFrame";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { cn } from "@/lib/utils";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import { NodeToolbarButton } from "../toolbar/NodeToolbarButton";
import NodeEmptyState from "../NodeEmptyState";
import { downloadBlob } from "@/lib/downloadFile";
import { AppTitleEditControl } from "../edit/AppTitleEditControl";
import { TbDownload, TbMaximize, TbRefresh } from "react-icons/tb";
import { colors } from "@/components/ui/styles";
import type { XyNodeProps, colorsEnum } from "@/types/domain";
import { useAppNodeRunner } from "@/hooks/useAppNodeRunner";
import IframeInteractionGate from "../IframeInteractionGate";
import { NodeHeader } from "../NodeHeader";
import { NODE_TYPE_ICON_MAP } from "./nodeIconMap";
import { filenameSlug } from "@/lib/filenameSlug";

function AppNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const values = useNodeDataValues(nodeDataId);
  const openWindow = useWindowsStore((s) => s.openWindow);

  const appTitle = useNodeDataTitle(nodeDataId) ?? "App";
  const [refreshKey, setRefreshKey] = useState(0);

  const isTitleVariant = xyNode.data.variant === "title";
  const nodeColor = colors[(xyNode.data?.color as colorsEnum) || "default"];

  const Icon = NODE_TYPE_ICON_MAP.app;

  const { iframeRef, srcdoc } = useAppNodeRunner(xyNode.id, nodeDataId, values, refreshKey);

  const handleOpenWindow = useCallback(() => {
    if (!nodeDataId) return;
    openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "app" });
  }, [nodeDataId, openWindow, xyNode.id]);

  // Le code de l'app est du JSX brut (composant `App`) : on le télécharge tel
  // qu'il est stocké, sans le HTML d'exécution que `buildSrcdoc` fabrique
  // autour — c'est la source, pas le bundle, qui est utile hors du canvas.
  const appCode = (values?.code as string | undefined) ?? "";

  const handleDownloadCode = useCallback(() => {
    downloadBlob(
      new Blob([appCode], { type: "text/jsx;charset=utf-8" }),
      `${filenameSlug(appTitle, "app")}.jsx`,
    );
  }, [appCode, appTitle]);

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        <NodeToolbarButton
          label="Open"
          disabled={!nodeDataId}
          onClick={handleOpenWindow}
        >
          <TbMaximize />
        </NodeToolbarButton>
        {appCode.trim().length > 0 && (
          <NodeToolbarButton
            label="Download"
            title="Download code"
            onClick={handleDownloadCode}
          >
            <TbDownload />
          </NodeToolbarButton>
        )}
        <AppTitleEditControl nodeDataId={nodeDataId} />
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode} resizable={!isTitleVariant}>
        {isTitleVariant ? (
          <div
            className={cn(
              "flex items-center gap-2 px-2 min-w-0 h-full relative",
              nodeColor.textColor,
            )}
          >
            <Icon size={18} className="shrink-0" />
            <p className="truncate flex-1 min-w-0" title={appTitle}>
              {appTitle}
            </p>
          </div>
        ) : !appCode.trim() ? (
          <NodeEmptyState
            icon={<Icon size={22} />}
            title="No app"
            action="none"
            hint="Ask Nolë to code something"
          />
        ) : (
          <div className="w-full h-full flex flex-col overflow-hidden rounded-[4px]">
            <NodeHeader
              icon={Icon}
              title={appTitle}
              actions={
                <button
                  className="shrink-0 text-slate-500 hover:text-slate-900 transition-colors p-1 rounded hover:bg-slate-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRefreshKey((k) => k + 1);
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  title="Refresh app"
                >
                  <TbRefresh size={14} />
                </button>
              }
            />
            <IframeInteractionGate
              className="flex-1 min-h-0"
              isNodeSelected={!!xyNode.selected}
              isNodeDragging={!!xyNode.dragging}
              label="Click to use this app"
            >
              <iframe
                key={refreshKey}
                ref={iframeRef}
                srcDoc={srcdoc}
                sandbox="allow-scripts"
                className="w-full h-full border-0"
                title={appTitle ?? "App Node"}
              />
            </IframeInteractionGate>
          </div>
        )}
      </NodeFrame>
    </>
  );
}

export default memo(AppNode, areNodePropsEqual);
