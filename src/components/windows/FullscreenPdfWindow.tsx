import { useCallback, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from "react-zoom-pan-pinch";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";
import "react-pdf/dist/Page/AnnotationLayer.css";
import { type OpenedWindow } from "@/stores/windowsStore";
import { useCanvasStore } from "@/stores/canvasStore";
import { isPendingDocId } from "@/lib/pendingDocIds";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { usePdfViewport } from "@/hooks/usePdfViewport";
import {
  PDF_MAX_ZOOM,
  PDF_MIN_ZOOM,
  pdfPixelRatio,
  pdfRenderScale,
} from "@/lib/pdfZoom";
import { useIsTabletPortrait } from "@/hooks/useTabletMode";
import type { FileFieldType } from "@/components/fields/file-fields/FileNameField";
import { api } from "@/../convex/_generated/api";
import { scrollToPdfPage } from "@/lib/pdfPageScroll";
import {
  buildFallbackOutline,
  buildOutlineFromPages,
  type OutlineEntry,
} from "@/lib/pdfOutline";
import { PdfOutlinePanel } from "./side-panel/PdfOutlinePanel";
import { PlanTabContentRegistrar } from "./side-panel/PlanTabContentRegistrar";
import FullscreenWindowFrame from "./FullscreenWindowFrame";
import { NoleAside } from "./FullscreenNolePanel";
import PdfPageControls from "./PdfPageControls";
import PdfZoomControls from "./PdfZoomControls";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface FullscreenPdfWindowProps {
  openedWindow: OpenedWindow;
}

export default function FullscreenPdfWindow({
  openedWindow,
}: FullscreenPdfWindowProps) {
  const { nodeDataId } = openedWindow;
  const canvasId = useCanvasStore((s) => s.canvas?._id);

  const nodeDataValues = useNodeDataValues(nodeDataId);
  const files = (nodeDataValues?.files as FileFieldType[] | undefined) ?? [];
  const pdfUrl = files.length > 0 ? files[0].url : "";

  const pdfPages = useQuery(
    api.searchableChunks.listPdfPages,
    // `isPendingDocId` : ce composant tient ses hooks AU-DESSUS de
    // `FullscreenWindowFrame`, donc la garde d'attente de la frame ne les
    // couvre pas. Un `pending_<llmId>` n'est pas un Id valide côté serveur.
    canvasId && !isPendingDocId(nodeDataId)
      ? { nodeDataId, canvasId }
      : "skip",
  );

  const transformRef = useRef<ReactZoomPanPinchContentRef>(null);

  const [numPages, setNumPages] = useState<number>(0);
  const [renderScale, setRenderScale] = useState(1);
  // horizontalPadding compense le px-8 du conteneur de pages ; maxBaseWidth
  // reproduit à 100 % la largeur de lecture confortable d'avant le zoom.
  const { viewportRef, baseWidth, visiblePages, activePage } = usePdfViewport({
    numPages,
    horizontalPadding: 64,
    minBaseWidth: 320,
    maxBaseWidth: 960,
  });

  const handleTransformed = useCallback(
    (_ref: unknown, state: { scale: number }) => {
      const next = pdfRenderScale(state.scale);
      setRenderScale((prev) => (prev === next ? prev : next));
    },
    [],
  );

  const onDocumentLoadSuccess = useCallback(
    ({ numPages: n }: { numPages: number }) => {
      setNumPages(n);
    },
    [],
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

  // Le sommaire et les contrôles de page visent la même chose — le haut de la
  // page demandée — donc ils partagent le même recadrage.
  const scrollToPage = useCallback((pageIndex: number) => {
    scrollToPdfPage(transformRef.current, pageIndex);
  }, []);

  // On portrait tablets, drop the chat side column for a focused, full-width
  // reading mode.
  const isTabletPortrait = useIsTabletPortrait();

  return (
    <FullscreenWindowFrame openedWindow={openedWindow} defaultSidePanelOpen>
      <PlanTabContentRegistrar
        content={
          <PdfOutlinePanel
            entries={displayedOutline}
            onSelect={scrollToPage}
            className="h-full"
          />
        }
      />
      <div className="flex min-h-0 flex-1">
        {/* Left: Nolë chat */}
        {!isTabletPortrait && <NoleAside />}

        {/* Middle: PDF viewer */}
        <main
          ref={viewportRef}
          className="relative flex min-w-0 flex-1 overflow-hidden"
        >
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
                // select-text annule le user-select:none imposé par la lib.
                wrapperClass="h-full w-full select-text!"
                wrapperStyle={{ width: "100%", height: "100%" }}
                // Le contenu transformé est en fit-content par défaut, donc calé
                // à gauche : on le force pleine largeur pour que les pages
                // restent centrées quand elles sont plus étroites que la vue.
                contentStyle={{ width: "100%" }}
              >
                <div className="flex w-full flex-col items-center gap-4 px-8 py-8">
                  <Document
                    file={pdfUrl}
                    className="flex flex-col gap-4"
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
                </div>
              </TransformComponent>

              <PdfPageControls
                className="absolute bottom-4 left-4"
                activePage={activePage}
                numPages={numPages}
              />
              <PdfZoomControls className="absolute bottom-4 right-4" />
            </TransformWrapper>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
              No PDF available
            </div>
          )}
        </main>
      </div>
    </FullscreenWindowFrame>
  );
}
