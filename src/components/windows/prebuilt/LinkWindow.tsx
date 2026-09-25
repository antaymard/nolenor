import { memo, useState, useCallback, useEffect } from "react";
import { useQuery } from "convex/react";
import { TbExternalLink } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { deriveEmbedUrl } from "@/../convex/lib/embedUrl";
import { LINK_EMBED_SANDBOX } from "@/lib/embedIframe";
import type { LinkValueType } from "@/components/nodes/prebuilt-nodes/LinkNode";
import { useCanvasStore } from "@/stores/canvasStore";
import { TranscriptPanel } from "@/components/windows/side-panel/TranscriptPanel";
import { useWindowFrameContext } from "../WindowFrameContext";
import WindowLoadingState from "@/components/windows/WindowLoadingState";

interface LinkWindowProps {
  nodeDataId: Id<"nodeDatas">;
}

/**
 * Le lien rendu dans une iframe — la variante `embed` du node, en grand.
 *
 * La barre de titre n'est pas décorative : beaucoup de sites refusent d'être
 * embarqués (`X-Frame-Options`, `frame-ancestors`), et un refus cross-origin
 * est indétectable depuis notre document — l'iframe déclenche bien son `load`,
 * mais son contenu reste inaccessible. Impossible donc d'afficher un message
 * d'échec fiable : on garde à la place une sortie toujours visible vers le
 * navigateur, qui répond au cas blanc sans avoir à le détecter.
 */
function LinkWindow({ nodeDataId }: LinkWindowProps) {
  const nodeDataValues = useNodeDataValues(nodeDataId);
  const [refreshKey, setRefreshKey] = useState(0);
  const { setRefreshHandler, setPlanTabContent } = useWindowFrameContext();

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    setRefreshHandler(handleRefresh);
    return () => setRefreshHandler(null);
  }, [handleRefresh, setRefreshHandler]);

  // ── Plan tab: read-only transcript, generated at index time ─────────────
  const canvasId = useCanvasStore((s) => s.canvas?._id);
  const chunks = useQuery(
    api.searchableChunks.listByNodeDataId,
    canvasId ? { nodeDataId, canvasId } : "skip",
  );
  useEffect(() => {
    setPlanTabContent(<TranscriptPanel chunks={chunks} />);
    return () => setPlanTabContent(null);
  }, [chunks, setPlanTabContent]);

  if (!nodeDataValues) return <WindowLoadingState />;

  const linkValue = nodeDataValues.link as LinkValueType | undefined;
  const href = linkValue?.href?.trim();

  if (!href) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        No link
      </div>
    );
  }

  const embedUrl = deriveEmbedUrl(href);
  const title = linkValue?.pageTitle || href;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-3">
        <p className="min-w-0 flex-1 truncate text-sm" title={title}>
          {title}
        </p>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          title="Open in a new tab"
        >
          <TbExternalLink size={16} />
        </a>
      </div>
      <iframe
        key={refreshKey}
        src={embedUrl}
        title={title}
        className="min-h-0 w-full flex-1 border-0"
        allow="autoplay; fullscreen; clipboard-read; clipboard-write"
        allowFullScreen
        sandbox={LINK_EMBED_SANDBOX}
      />
    </div>
  );
}

export default memo(LinkWindow);
