import { memo } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface PdfZoomControlsProps {
  zoom: number;
  canZoomIn: boolean;
  canZoomOut: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  className?: string;
}

const buttonClass =
  "flex items-center justify-center rounded-full p-1.5 transition-colors hover:bg-white/20 disabled:pointer-events-none disabled:opacity-40";

function PdfZoomControls({
  zoom,
  canZoomIn,
  canZoomOut,
  onZoomIn,
  onZoomOut,
  onReset,
  className,
}: PdfZoomControlsProps) {
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
        onClick={onZoomOut}
        disabled={!canZoomOut}
        aria-label="Zoom out"
        title="Zoom out"
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        className="min-w-11 rounded-full px-1 py-1 text-xs tabular-nums transition-colors hover:bg-white/20"
        onClick={onReset}
        aria-label="Reset zoom"
        title="Reset zoom"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        type="button"
        className={buttonClass}
        onClick={onZoomIn}
        disabled={!canZoomIn}
        aria-label="Zoom in"
        title="Zoom in"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}

export default memo(PdfZoomControls);
