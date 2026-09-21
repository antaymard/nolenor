import { memo, useCallback, useState } from "react";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeFrame from "../NodeFrame";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import { NodeToolbarButton } from "../toolbar/NodeToolbarButton";
import NodeEmptyState from "../NodeEmptyState";
import IframeInteractionGate from "../IframeInteractionGate";
import { LinkEditControl } from "../edit/LinkEditControl";
import type { LinkValueType } from "../edit/LinkEditControl";
import {
  TbLink,
  TbExternalLink,
  TbCopy,
  TbCopyCheck,
  TbMaximize,
  TbRefresh,
} from "react-icons/tb";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useWindowsStore } from "@/stores/windowsStore";
import { deriveEmbedUrl } from "@/../convex/lib/embedUrl";
import toast from "react-hot-toast";
import type { XyNodeProps } from "@/types/domain";

export type { LinkValueType };

const defaultValue: LinkValueType = {
  href: "",
  pageTitle: "",
};

function LinkNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const values = useNodeDataValues(nodeDataId);
  const openWindow = useWindowsStore((s) => s.openWindow);

  const [isCopied, setIsCopied] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const linkValue = (values?.link as LinkValueType | undefined) ?? defaultValue;
  const isPreview = xyNode.data.variant === "preview";
  const isEmbed = xyNode.data.variant === "embed";

  const handleCopyUrl = async () => {
    if (!linkValue.href) return;
    try {
      await navigator.clipboard.writeText(linkValue.href);
      setIsCopied(true);
      toast.success("Link copied to clipboard");
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("Unable to copy link");
    }
  };

  const handleOpenWindow = useCallback(() => {
    if (!nodeDataId) return;
    openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "link" });
  }, [nodeDataId, openWindow, xyNode.id]);

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        <NodeToolbarButton
          label="Open"
          disabled={!nodeDataId}
          title="Open in a window"
          onClick={handleOpenWindow}
        >
          <TbMaximize />
        </NodeToolbarButton>
        <LinkEditControl nodeDataId={nodeDataId} />
        {linkValue.href && (
          <NodeToolbarButton
            label={isCopied ? "Copied" : "Copy link"}
            title="Copy link URL"
            onClick={handleCopyUrl}
          >
            {isCopied ? <TbCopyCheck /> : <TbCopy />}
          </NodeToolbarButton>
        )}
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode} resizable={isPreview || isEmbed}>
        {isEmbed ? (
          linkValue.href ? (
            <div className="w-full h-full flex flex-col overflow-hidden rounded-[4px]">
              <div className="flex items-center gap-2 h-8 shrink-0 px-2 py-1.5 font-medium rounded-t-[4px]">
                <TbLink size={18} className="shrink-0" />
                <p
                  className="truncate flex-1 min-w-0"
                  title={linkValue.pageTitle || linkValue.href}
                >
                  {linkValue.pageTitle || linkValue.href}
                </p>
                <button
                  className="shrink-0 text-slate-500 hover:text-slate-900 transition-colors p-1 rounded hover:bg-slate-100"
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
              <IframeInteractionGate
                className="flex-1 min-h-0"
                isNodeSelected={!!xyNode.selected}
                isNodeDragging={!!xyNode.dragging}
                label="Click to interact"
              >
                <iframe
                  key={refreshKey}
                  src={deriveEmbedUrl(linkValue.href)}
                  title={linkValue.pageTitle || "Embedded content"}
                  className="w-full h-full border-0"
                  allow="autoplay; fullscreen; clipboard-read; clipboard-write"
                  allowFullScreen
                  sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
                />
              </IframeInteractionGate>
            </div>
          ) : (
            <NodeEmptyState
              icon={<TbLink size={22} />}
              title="No link"
              action="pencil"
            />
          )
        ) : isPreview ? (
          linkValue.href ? (
            <div className="link-preview-container flex flex-col h-full overflow-hidden">
              <div className="relative w-full flex-1 min-h-0 overflow-hidden bg-muted">
                {linkValue.pageImage ? (
                  <img
                    src={linkValue.pageImage}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (
                        e.currentTarget.parentElement as HTMLElement
                      ).style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full bg-muted/50">
                    <TbLink size={32} className="text-muted-foreground" />
                  </div>
                )}
                <a
                  href={linkValue.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 hover:bg-black/80 text-white rounded-sm px-2 py-1 text-xs cursor-pointer transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${(() => {
                      try {
                        return new URL(linkValue.href).hostname;
                      } catch {
                        return "";
                      }
                    })()}&sz=16`}
                    alt=""
                    className="w-4 h-4"
                  />
                  <span>
                    {(() => {
                      try {
                        return new URL(linkValue.href).hostname.replace(
                          /^www\./,
                          "",
                        );
                      } catch {
                        return linkValue.href;
                      }
                    })()}
                  </span>
                  <TbExternalLink size={12} />
                </a>
              </div>
              <div className="flex flex-col gap-1 px-3 py-2.5 min-w-0 shrink-0">
                <p className="font-medium leading-tight line-clamp-3">
                  {linkValue.pageTitle || linkValue.href}
                </p>
                {linkValue.pageDescription && (
                  <p className="link-preview-description text-muted-foreground leading-snug line-clamp-3">
                    {linkValue.pageDescription}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <NodeEmptyState
              icon={<TbLink size={22} />}
              title="No link"
              action="pencil"
            />
          )
        ) : (
          <div className="flex items-center gap-2 px-2 min-w-0 h-full group/linknode relative">
            {linkValue.href ? (
              <>
                <TbLink size={18} className="shrink-0" />
                <p
                  className="truncate flex-1 min-w-0"
                  title={linkValue.pageTitle || linkValue.href}
                >
                  {linkValue.pageTitle || <i>No title</i>}
                </p>
                {xyNode.selected && (
                  <a
                    href={linkValue.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="absolute right-2 top-1/2 -translate-y-1/2 bg-background hover:bg-muted rounded-sm p-1 cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <TbExternalLink size={16} />
                  </a>
                )}
              </>
            ) : (
              <NodeEmptyState
                icon={<TbLink size={18} />}
                title="No link"
                action="pencil"
                compact
              />
            )}
          </div>
        )}
      </NodeFrame>
    </>
  );
}

export default memo(LinkNode, areNodePropsEqual);
