import { memo, useState, useCallback, useEffect } from "react";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeDataValues } from "@/hooks/useNodeData";
import type { EmbedValueType } from "@/components/nodes/prebuilt-nodes/EmbedNode";
import { useWindowFrameContext } from "../WindowFrameContext";

interface EmbedWindowProps {
  nodeDataId: Id<"nodeDatas">;
}

function EmbedWindow({ nodeDataId }: EmbedWindowProps) {
  const nodeDataValues = useNodeDataValues(nodeDataId);
  const embedValue = nodeDataValues?.embed as EmbedValueType | undefined;
  const [refreshKey, setRefreshKey] = useState(0);
  const { setRefreshHandler } = useWindowFrameContext();

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    setRefreshHandler(handleRefresh);
    return () => setRefreshHandler(null);
  }, [handleRefresh, setRefreshHandler]);

  if (!nodeDataValues) return null;

  return embedValue?.embedUrl ? (
    <iframe
      key={refreshKey}
      src={embedValue.embedUrl}
      title={embedValue.title ?? "Embedded content"}
      className="h-full w-full border-0"
      allow="autoplay; fullscreen; clipboard-read; clipboard-write"
      allowFullScreen
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
    />
  ) : (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      No embed
    </div>
  );
}

export default memo(EmbedWindow);
