import { memo, useState, useCallback, useEffect } from "react";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useAppNodeRunner } from "@/hooks/useAppNodeRunner";
import { useWindowFrameContext } from "../WindowFrameContext";

interface AppWindowProps {
  xyNodeId: string;
  nodeDataId: Id<"nodeDatas">;
}

function AppWindow({ xyNodeId, nodeDataId }: AppWindowProps) {
  const values = useNodeDataValues(nodeDataId);
  const [refreshKey, setRefreshKey] = useState(0);
  const { setRefreshHandler } = useWindowFrameContext();

  const handleRefresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  useEffect(() => {
    setRefreshHandler(handleRefresh);
    return () => setRefreshHandler(null);
  }, [handleRefresh, setRefreshHandler]);

  const { iframeRef, srcdoc } = useAppNodeRunner(xyNodeId, nodeDataId, values, refreshKey);

  if (!values) return null;

  return (
    <iframe
      key={refreshKey}
      ref={iframeRef}
      srcDoc={srcdoc}
      sandbox="allow-scripts"
      className="h-full w-full border-0 bg-transparent"
      title="App Window"
    />
  );
}

export default memo(AppWindow);
