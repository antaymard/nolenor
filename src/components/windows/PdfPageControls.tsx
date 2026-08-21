import { memo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useControls } from "react-zoom-pan-pinch";
import { cn } from "@/lib/utils";
import { scrollToPdfPage } from "@/lib/pdfPageScroll";

const buttonClass =
  "flex items-center justify-center rounded-full p-1.5 transition-colors hover:bg-white/20 disabled:pointer-events-none disabled:opacity-40";

/**
 * Position de lecture dans le document, et de quoi en descendre.
 *
 * À rendre à l'intérieur d'un `<TransformWrapper>` : sous transform il n'y a
 * plus de barre de défilement, donc plus rien qui dise où on en est ni qui
 * permette d'avancer autrement qu'à la molette.
 */
function PdfPageControls({
  activePage,
  numPages,
  className,
}: {
  /** Index (0-based) de la page en cours de lecture. */
  activePage: number;
  numPages: number;
  className?: string;
}) {
  const controls = useControls();

  if (numPages <= 0) return null;

  const page = Math.min(activePage, numPages - 1);

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
        onClick={() => scrollToPdfPage(controls, page - 1)}
        disabled={page <= 0}
        aria-label="Previous page"
        title="Previous page"
      >
        <ChevronUp size={14} />
      </button>
      <span
        className="min-w-11 px-1 py-1 text-center text-xs tabular-nums"
        aria-label={`Page ${page + 1} of ${numPages}`}
      >
        {page + 1} / {numPages}
      </span>
      <button
        type="button"
        className={buttonClass}
        onClick={() => scrollToPdfPage(controls, page + 1)}
        disabled={page >= numPages - 1}
        aria-label="Next page"
        title="Next page"
      >
        <ChevronDown size={14} />
      </button>
    </div>
  );
}

export default memo(PdfPageControls);
