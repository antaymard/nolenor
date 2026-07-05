import { memo, useCallback, useState } from "react";
import { type Node } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { areNodePropsEqual } from "../areNodePropsEqual";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useWindowsStore } from "@/stores/windowsStore";
import NodeFrame from "../NodeFrame";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { cn } from "@/lib/utils";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { TbPencil, TbMaximize, TbRefresh } from "react-icons/tb";
import { colors } from "@/components/ui/styles";
import type { colorsEnum } from "@/types/domain";
import { useAppNodeRunner } from "@/hooks/useAppNodeRunner";
import { useIframeCtrlOverlay } from "@/hooks/useIframeCtrlOverlay";
import { NODE_TYPE_ICON_MAP } from "./nodeIconMap";

function AppNode(xyNode: Node) {
  const nodeDataId = xyNode.data?.nodeDataId as Id<"nodeDatas"> | undefined;
  const values = useNodeDataValues(nodeDataId);
  const openWindow = useWindowsStore((s) => s.openWindow);

  const updateValuesMutation = useMutation(api.nodeDatas.updateValues);
  const appTitle = useNodeDataTitle(nodeDataId) ?? "App";
  const [inputTitle, setInputTitle] = useState("");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const isTitleVariant = xyNode.data.variant === "title";
  const nodeColor = colors[(xyNode.data?.color as colorsEnum) || "default"];

  const Icon = NODE_TYPE_ICON_MAP.app;

  const { iframeRef, srcdoc } = useAppNodeRunner(xyNode.id, nodeDataId, values, refreshKey);
  const { showOverlay, onMouseEnter, onMouseLeave } = useIframeCtrlOverlay();

  const handleOpenWindow = useCallback(() => {
    if (!nodeDataId) return;
    openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "app" });
  }, [nodeDataId, openWindow, xyNode.id]);

  const handleSaveTitle = useCallback(() => {
    if (!nodeDataId || !inputTitle.trim()) return;
    updateValuesMutation({
      _id: nodeDataId,
      values: { title: inputTitle.trim() },
    });
    setIsPopoverOpen(false);
    setInputTitle("");
  }, [nodeDataId, inputTitle, updateValuesMutation]);

  const handlePopoverOpenChange = useCallback(
    (open: boolean) => {
      setIsPopoverOpen(open);
      if (open) {
        setInputTitle((values?.title as string) ?? "");
      }
    },
    [values?.title],
  );

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
        <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="icon" title="Edit app title">
              <TbPencil />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex flex-col gap-2">
              <Input
                onDoubleClick={(e) => e.stopPropagation()}
                type="text"
                placeholder="Title (optional)"
                value={inputTitle}
                onChange={(e) => setInputTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveTitle();
                }}
              />
              <Button
                onClick={handleSaveTitle}
                size="sm"
                disabled={!inputTitle.trim()}
              >
                Save
              </Button>
            </div>
          </PopoverContent>
        </Popover>
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
        ) : (
          <div className="w-full h-full flex flex-col overflow-hidden rounded-[4px]">
            <div
              className={cn(
                "flex items-center gap-2 h-8 shrink-0 px-2 py-1.5 font-medium rounded-t-[4px]",
              )}
            >
              <Icon size={18} className="shrink-0" />
              <p className="truncate flex-1 min-w-0" title={appTitle}>
                {appTitle}
              </p>
              <button
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent/60"
                onClick={(e) => {
                  e.stopPropagation();
                  setRefreshKey((k) => k + 1);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title="Refresh app"
              >
                <TbRefresh size={14} />
              </button>
            </div>
            <div
              className="relative flex-1 min-h-0"
              onMouseEnter={onMouseEnter}
              onMouseLeave={onMouseLeave}
            >
              <iframe
                key={refreshKey}
                ref={iframeRef}
                srcDoc={srcdoc}
                sandbox="allow-scripts"
                className="w-full h-full border-0"
                title={appTitle ?? "App Node"}
              />
              {showOverlay && <div className="absolute inset-0" />}
            </div>
          </div>
        )}
      </NodeFrame>
    </>
  );
}

export default memo(AppNode, areNodePropsEqual);
