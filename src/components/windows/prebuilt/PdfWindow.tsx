import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useReactFlow } from "@xyflow/react";
import { useQuery } from "convex/react";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { usePdfViewport } from "@/hooks/usePdfViewport";
import {
  PDF_MAX_ZOOM,
  PDF_MIN_ZOOM,
  pdfPixelRatio,
  pdfRenderScale,
} from "@/lib/pdfZoom";
import { scrollToPdfPage } from "@/lib/pdfPageScroll";
import {
  buildFallbackOutline,
  buildOutlineFromPages,
  type OutlineEntry,
} from "@/lib/pdfOutline";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { FileFieldType } from "@/components/fields/file-fields/FileNameField";
import { useCanvasStore } from "@/stores/canvasStore";
import { useWindowFrameContext } from "@/components/windows/WindowFrameContext";
import { PdfOutlinePanel } from "@/components/windows/side-panel/PdfOutlinePanel";
import PdfPageControls from "../PdfPageControls";
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
  // Échelle arrondie à un palier : le zoom lui-même est un transform CSS, on ne
  // re-rend les canvas que quand le gain de netteté en vaut la peine.
  const [renderScale, setRenderScale] = useState(1);
  const { viewportRef, baseWidth, visiblePages, activePage } = usePdfViewport({
    numPages,
  });

  const onDocumentLoadSuccess = useCallback(
    ({ numPages }: { numPages: number }) => {
      setNumPages(numPages);
    },
    [],
  );

  const handleTransformed = useCallback(
    (_ref: unknown, state: { scale: number }) => {
      const next = pdfRenderScale(state.scale);
      setRenderScale((prev) => (prev === next ? prev : next));
    },
    [],
  );

  // ── Plan tab: outline + scroll-to-page ──────────────────────────────────
  const canvasId = useCanvasStore((s) => s.canvas?._id);
  const pdfPages = useQuery(
    api.searchableChunks.listPdfPages,
    canvasId ? { nodeDataId, canvasId } : "skip",
  );
  const outline = useMemo<OutlineEntry[]>(
    () => buildOutlineFromPages(pdfPages),
    [pdfPages],
  );
  const fallbackOutline = useMemo<OutlineEntry[]>(
    () => buildFallbackOutline(numPages),
    [numPages],
  );
  const displayedOutline = outline.length > 0 ? outline : fallbackOutline;

  const transformRef = useRef<ReactZoomPanPinchContentRef>(null);
  const scrollToPage = useCallback((pageIndex: number) => {
    scrollToPdfPage(transformRef.current, pageIndex);
  }, []);

  const { setPlanTabContent } = useWindowFrameContext();
  useEffect(() => {
    setPlanTabContent(
      <PdfOutlinePanel
        entries={displayedOutline}
        onSelect={scrollToPage}
        className="h-full"
      />,
    );
    return () => setPlanTabContent(null);
  }, [displayedOutline, scrollToPage, setPlanTabContent]);

  if (!nodeDataValues || !xyNode) return null;

  return (
    <div ref={viewportRef} className="relative w-full h-full overflow-hidden">
      {pdfUrl ? (
        <TransformWrapper
          ref={transformRef}
          minScale={PDF_MIN_ZOOM}
          maxScale={PDF_MAX_ZOOM}
          centerZoomedOut
          // Molette seule → défilement ; ctrl/⌘ + molette et pinch → zoom.
          wheel={{ wheelDisabled: true }}
          // Le clic gauche reste à la sélection de texte, pas au pan.
          panning={{
            wheelPanning: true,
            velocityDisabled: true,
            allowLeftClickPan: false,
          }}
          doubleClick={{ disabled: true }}
          onTransformed={handleTransformed}
        >
          <TransformComponent
            // select-text annule le user-select:none imposé par la lib, sans quoi
            // le texte du PDF ne serait plus sélectionnable.
            wrapperClass="h-full w-full select-text!"
            wrapperStyle={{ width: "100%", height: "100%" }}
            // Le contenu transformé est en fit-content par défaut, donc calé à
            // gauche : on le force pleine largeur pour que les pages restent
            // centrées quand elles sont plus étroites que la vue.
            contentStyle={{ width: "100%" }}
          >
            <Document
              file={pdfUrl}
              className="flex w-full flex-col items-center gap-2"
              onLoadSuccess={onDocumentLoadSuccess}
            >
              {Array.from({ length: numPages }, (_, index) => (
                <div key={`page_${index + 1}`} data-page-index={index}>
                  <Page
                    pageNumber={index + 1}
                    width={baseWidth}
                    devicePixelRatio={pdfPixelRatio(
                      renderScale,
                      visiblePages.has(index),
                    )}
                  />
                </div>
              ))}
            </Document>
          </TransformComponent>

          <PdfPageControls
            className="absolute bottom-3 left-3"
            activePage={activePage}
            numPages={numPages}
          />
          <PdfZoomControls className="absolute bottom-3 right-3" />
        </TransformWrapper>
      ) : (
        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
          No PDF available
        </div>
      )}
    </div>
  );
}

export default memo(PdfWindow);
