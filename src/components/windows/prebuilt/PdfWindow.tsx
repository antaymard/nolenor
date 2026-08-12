import { memo, useState, useCallback } from "react";
import { useReactFlow } from "@xyflow/react";
import { useNodeDataValues } from "@/hooks/useNodeData";
import type { Id } from "@/../convex/_generated/dataModel";
import type { FileFieldType } from "@/components/fields/file-fields/FileNameField";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { usePdfZoom } from "@/hooks/usePdfZoom";
import PdfZoomControls from "../PdfZoomControls";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

function PdfWindow({
  xyNodeId,
  nodeDataId,
}: {
  xyNodeId: string;
  nodeDataId: Id<"nodeDatas">;
}) {
  const { getNode } = useReactFlow();
  const xyNode = getNode(xyNodeId);
  const nodeDataValues = useNodeDataValues(nodeDataId);
  const files = (nodeDataValues?.files as FileFieldType[] | undefined) ?? [];
  const pdfUrl = files.length > 0 ? files[0].url : "";

  const [numPages, setNumPages] = useState<number>(0);
  const {
    scrollRef,
    zoom,
    renderWidth,
    zoomIn,
    zoomOut,
    resetZoom,
    canZoomIn,
    canZoomOut,
  } = usePdfZoom();

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
    },
    [],
  );

  if (!nodeDataValues || !xyNode) return null;

  return (
    <div className="relative w-full h-full">
      <div ref={scrollRef} className="w-full h-full overflow-auto">
        {pdfUrl ? (
          // w-fit permet le débordement horizontal au-delà de 100 % de zoom,
          // min-w-full + items-center gardent les pages centrées en deçà.
          <Document
            file={pdfUrl}
            className="flex w-fit min-w-full flex-col items-center gap-2"
            onLoadSuccess={onDocumentLoadSuccess}
          >
            {Array.from({ length: numPages }, (_, index) => (
              <Page
                key={`page_${index + 1}`}
                pageNumber={index + 1}
                width={renderWidth}
              />
            ))}
          </Document>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No PDF available
          </div>
        )}
      </div>

      {pdfUrl && (
        <PdfZoomControls
          className="absolute bottom-3 right-3"
          zoom={zoom}
          canZoomIn={canZoomIn}
          canZoomOut={canZoomOut}
          onZoomIn={zoomIn}
          onZoomOut={zoomOut}
          onReset={resetZoom}
        />
      )}
    </div>
  );
}

export default memo(PdfWindow);
