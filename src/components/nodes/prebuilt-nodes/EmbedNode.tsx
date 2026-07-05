import { memo, useCallback, useState } from "react";
import type { Node } from "@xyflow/react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeFrame from "../NodeFrame";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { TbMaximize, TbPencil, TbRefresh } from "react-icons/tb";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import type { Id } from "@/../convex/_generated/dataModel";
import { useWindowsStore } from "@/stores/windowsStore";
import { useIframeCtrlOverlay } from "@/hooks/useIframeCtrlOverlay";
import { colors } from "@/components/ui/styles";
import type { colorsEnum } from "@/types/domain";
import { cn } from "@/lib/utils";
import { NODE_TYPE_ICON_MAP } from "./nodeIconMap";

type EmbedType =
  | "youtube"
  | "google-docs"
  | "google-sheets"
  | "google-slides"
  | "generic";

export type EmbedValueType = {
  url: string;
  embedUrl: string;
  title?: string;
  type: EmbedType;
};

function detectType(url: string): { embedUrl: string; type: EmbedType } {
  if (url.includes("youtube.com/embed") || url.includes("youtu.be"))
    return { embedUrl: url, type: "youtube" };
  if (url.includes("docs.google.com/document"))
    return { embedUrl: url, type: "google-docs" };
  if (url.includes("docs.google.com/spreadsheets"))
    return { embedUrl: url, type: "google-sheets" };
  if (url.includes("docs.google.com/presentation"))
    return { embedUrl: url, type: "google-slides" };
  return { embedUrl: url, type: "generic" };
}

function parseEmbedInput(input: string): { embedUrl: string; type: EmbedType } {
  const trimmed = input.trim();

  // Cas 1 : snippet <iframe> → extraire le src
  if (trimmed.toLowerCase().includes("<iframe")) {
    const match = trimmed.match(/src=["']([^"']+)["']/i);
    if (match) return detectType(match[1]);
  }

  // Cas 2 : URL brute YouTube (watch?v=…) → transformer en embed
  try {
    let url = trimmed;
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = "https://" + url;
    }
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "youtube.com" || host === "youtu.be") {
      const videoId =
        host === "youtu.be"
          ? parsed.pathname.slice(1)
          : parsed.searchParams.get("v");
      if (videoId) {
        return {
          embedUrl: `https://www.youtube.com/embed/${videoId}`,
          type: "youtube",
        };
      }
    }

    if (host === "docs.google.com") {
      const path = parsed.pathname;
      const docMatch = path.match(/\/document\/d\/([^/]+)/);
      if (docMatch)
        return {
          embedUrl: `https://docs.google.com/document/d/${docMatch[1]}/preview`,
          type: "google-docs",
        };
      const sheetMatch = path.match(/\/spreadsheets\/d\/([^/]+)/);
      if (sheetMatch)
        return {
          embedUrl: `https://docs.google.com/spreadsheets/d/${sheetMatch[1]}/preview`,
          type: "google-sheets",
        };
      const slideMatch = path.match(/\/presentation\/d\/([^/]+)/);
      if (slideMatch)
        return {
          embedUrl: `https://docs.google.com/presentation/d/${slideMatch[1]}/embed`,
          type: "google-slides",
        };
    }

    return detectType(url);
  } catch {
    return { embedUrl: trimmed, type: "generic" };
  }
}

function EmbedNode(xyNode: Node) {
  const nodeDataId = xyNode.data?.nodeDataId as Id<"nodeDatas"> | undefined;
  const values = useNodeDataValues(nodeDataId);
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const openWindow = useWindowsStore((s) => s.openWindow);
  const embedTitle = useNodeDataTitle(nodeDataId) ?? "Embed";

  const [inputUrl, setInputUrl] = useState("");
  const [inputTitle, setInputTitle] = useState("");
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const embedValue = values?.embed as EmbedValueType | undefined;
  const isTitleVariant = xyNode.data.variant === "title";
  const nodeColor = colors[(xyNode.data?.color as colorsEnum) || "default"];
  const { showOverlay, onMouseEnter, onMouseLeave } = useIframeCtrlOverlay();

  const Icon = NODE_TYPE_ICON_MAP.embed;

  const handleOpenWindow = useCallback(() => {
    if (!nodeDataId) return;
    openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "embed" });
  }, [nodeDataId, openWindow, xyNode.id]);

  const handleSave = () => {
    if (!nodeDataId || !inputUrl.trim()) return;

    const { embedUrl, type } = parseEmbedInput(inputUrl);

    updateNodeDataValues({
      nodeDataId,
      values: {
        embed: {
          url: inputUrl.trim(),
          embedUrl,
          title: inputTitle.trim() || undefined,
          type,
        },
      },
    });
    setIsPopoverOpen(false);
    setInputUrl("");
    setInputTitle("");
  };

  const handlePopoverOpenChange = (open: boolean) => {
    setIsPopoverOpen(open);
    if (open) {
      setInputUrl(embedValue?.url ?? "");
      setInputTitle(embedValue?.title ?? "");
    }
  };

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
            <Button variant="outline" size="icon" title="Edit embed URL">
              <TbPencil />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex flex-col gap-2">
              <Input
                onDoubleClick={(e) => e.stopPropagation()}
                type="text"
                placeholder="URL or <iframe> embed code..."
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
              <Input
                onDoubleClick={(e) => e.stopPropagation()}
                type="text"
                placeholder="Title (optional)"
                value={inputTitle}
                onChange={(e) => setInputTitle(e.target.value)}
              />
              <Button
                onClick={handleSave}
                size="sm"
                disabled={!inputUrl.trim()}
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
            <p className="truncate flex-1 min-w-0" title={embedTitle}>
              {embedTitle}
            </p>
          </div>
        ) : embedValue?.embedUrl ? (
          <div className="w-full h-full flex flex-col overflow-hidden rounded-[4px]">
            <div
              className={cn(
                "flex items-center gap-2 h-8 shrink-0 px-2 py-1.5 font-medium rounded-t-[4px]",
              )}
            >
              <Icon size={18} className="shrink-0" />
              <p
                className="truncate flex-1 min-w-0"
                title={embedValue.title ?? "Embed"}
              >
                {embedValue.title ?? "Embed"}
              </p>
              <button
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-accent/60"
                onClick={(e) => {
                  e.stopPropagation();
                  setRefreshKey((k) => k + 1);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                title="Refresh embed"
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
                src={embedValue.embedUrl}
                title={embedValue.title ?? "Embedded content"}
                className="w-full h-full border-0"
                allow="autoplay; fullscreen; clipboard-read; clipboard-write"
                allowFullScreen
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
              />
              {showOverlay && <div className="absolute inset-0" />}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground select-none">
            <Icon size={28} />
            <span className="text-sm">
              Paste a URL or &lt;iframe&gt; embed code
            </span>
          </div>
        )}
      </NodeFrame>
    </>
  );
}

export default memo(EmbedNode, areNodePropsEqual);
