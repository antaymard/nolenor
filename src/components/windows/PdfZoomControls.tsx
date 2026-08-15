import { memo, useCallback } from "react";
import { Minus, Plus } from "lucide-react";
import {
  useControls,
  useTransformComponent,
  type ReactZoomPanPinchContextState,
} from "react-zoom-pan-pinch";
import { cn } from "@/lib/utils";
import { PDF_MAX_ZOOM, PDF_MIN_ZOOM, PDF_ZOOM_STEP } from "@/lib/pdfZoom";

const buttonClass =
  "flex items-center justify-center rounded-full p-1.5 transition-colors hover:bg-white/20 disabled:pointer-events-none disabled:opacity-40";

const selectScale = (ref: ReactZoomPanPinchContextState) => ref.state.scale;

/** À rendre à l'intérieur d'un <TransformWrapper>. */
function PdfZoomControls({ className }: { className?: string }) {
  const { zoomIn, zoomOut, resetTransform } = useControls();
  // S'abonne à l'échelle sans faire re-rendre le <Document> à chaque frame.
  const scale = useTransformComponent(selectScale);

  const handleZoomIn = useCallback(() => zoomIn(PDF_ZOOM_STEP), [zoomIn]);
  const handleZoomOut = useCallback(() => zoomOut(PDF_ZOOM_STEP), [zoomOut]);
  const handleReset = useCallback(() => resetTransform(), [resetTransform]);

  return (
    <div
      className={cn(
        // z-10 : les couches texte (z-index 2) et annotations (z-index 3) de
        // react-pdf intercepteraient sinon les clics.
        "z-10 flex items-center gap-0.5 rounded-full bg-black/40 p-0.5 text-white opacity-60 transition-opacity hover:opacity-100",
        className,
      )}
    >
      <button
        type="button"
        className={buttonClass}
        onClick={handleZoomOut}
        disabled={scale <= PDF_MIN_ZOOM}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        className="min-w-11 rounded-full px-1 py-1 text-xs tabular-nums transition-colors hover:bg-white/20"
        onClick={handleReset}
        aria-label="Reset zoom"
        title="Reset zoom"
      >
        {Math.round(scale * 100)}%
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={handleZoomIn}
        disabled={scale >= PDF_MAX_ZOOM}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

export default memo(PdfZoomControls);
