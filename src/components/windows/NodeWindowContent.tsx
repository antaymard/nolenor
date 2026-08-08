import { lazy, Suspense } from "react";
import { Spinner } from "@/components/shadcn/spinner";
import type { OpenedWindow } from "@/stores/windowsStore";

// Window bodies are lazy-loaded: they pull heavy dependencies (BlockNote
// editor, pdfjs, tanstack-table…) that shouldn't weigh down the canvas chunk.
// Ce module est le *seul* point d'import de ces bodies : desktop et mobile
// partagent donc les mêmes chunks.
const BlocknoteWindow = lazy(() => import("./prebuilt/BlocknoteWindow"));
const EmbedWindow = lazy(() => import("./prebuilt/EmbedWindow"));
const ImageWindow = lazy(() => import("./prebuilt/ImageWindow"));
const PdfWindow = lazy(() => import("./prebuilt/PdfWindow"));
const TableWindow = lazy(() => import("./prebuilt/TableWindow"));
const AppWindow = lazy(() => import("./prebuilt/AppWindow"));
const CustomWindow = lazy(() => import("./prebuilt/CustomWindow"));

type NodeWindowContentProps = Pick<
  OpenedWindow,
  "nodeType" | "xyNodeId" | "nodeDataId"
>;

export default function NodeWindowContent(props: NodeWindowContentProps) {
  return (
    <Suspense
      fallback={
        <div className="flex h-full items-center justify-center">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      }
    >
      <NodeWindowBody {...props} />
    </Suspense>
  );
}

function NodeWindowBody({
  nodeType,
  xyNodeId,
  nodeDataId,
}: NodeWindowContentProps) {
  switch (nodeType) {
    case "blocknote":
      return <BlocknoteWindow nodeDataId={nodeDataId} />;
    case "embed":
      return <EmbedWindow nodeDataId={nodeDataId} />;
    case "app":
      return <AppWindow xyNodeId={xyNodeId} nodeDataId={nodeDataId} />;
    case "pdf":
      return <PdfWindow xyNodeId={xyNodeId} nodeDataId={nodeDataId} />;
    case "image":
      return <ImageWindow nodeDataId={nodeDataId} />;
    case "table":
      return <TableWindow nodeDataId={nodeDataId} />;
    case "custom":
      return <CustomWindow nodeDataId={nodeDataId} />;
    default:
      return (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          {nodeType}
        </div>
      );
  }
}
