import { useStore, type ReactFlowState } from "@xyflow/react";
import type {
  AlignmentGuide,
  SnapGuides,
  SpacingSegment,
} from "@/lib/snapGuides";
import { useSnapGuidesStore } from "@/stores/snapGuidesStore";

// Les teintes de Figma : rouge pour l'alignement, rose pour l'espacement.
// Saturées et identiques en clair comme en sombre : un guide doit trancher sur
// n'importe quel fond de canvas et n'importe quel node.
const ALIGNMENT_COLOR = "#f24822";
const SPACING_COLOR = "#ec4899";
/** Demi-taille des croix posées aux coins alignés, en pixels écran. */
const MARK_SIZE = 3;
/** Demi-longueur des butées au bout d'un écart, en pixels écran. */
const TICK_SIZE = 4;

const transformSelector = (state: ReactFlowState) => state.transform;

/**
 * Les guides d'alignement du drag en cours (cf. `useNodeSnapping`).
 *
 * Dessinés en coordonnées écran, au-dessus des nodes et sous les panneaux
 * d'UI : un trait d'un pixel net à tous les zooms, et des étiquettes d'écart
 * lisibles même dézoomé. Rien n'est monté hors d'un geste.
 */
export default function SnapGuidesOverlay() {
  const guides = useSnapGuidesStore((state) => state.guides);
  if (!guides) return null;
  return <SnapGuidesLayer guides={guides} />;
}

// Séparé pour ne s'abonner au viewport que pendant un geste aimanté : hors
// drag, un pan ne doit rien re-rendre ici.
function SnapGuidesLayer({ guides }: { guides: SnapGuides }) {
  const [tx, ty, zoom] = useStore(transformSelector);
  // Un trait d'un pixel tombe pile sur la grille de pixels à +0,5.
  const toScreenX = (x: number) => Math.round(x * zoom + tx) + 0.5;
  const toScreenY = (y: number) => Math.round(y * zoom + ty) + 0.5;

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      // Au-dessus du renderer de React Flow (z 4, qui porte les nodes), au
      // niveau des panneaux (z 5) mais rendu avant eux : ils restent devant.
      style={{ zIndex: 5 }}
      aria-hidden
    >
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        {guides.alignments.map((guide) => (
          <AlignmentLine
            key={`${guide.axis}:${guide.pos}`}
            guide={guide}
            toScreenX={toScreenX}
            toScreenY={toScreenY}
          />
        ))}
        {guides.spacings.map((segment, index) => (
          <SpacingLine
            key={index}
            segment={segment}
            toScreenX={toScreenX}
            toScreenY={toScreenY}
          />
        ))}
      </svg>
      {guides.spacings.map((segment, index) => (
        <SpacingLabel
          key={index}
          segment={segment}
          toScreenX={toScreenX}
          toScreenY={toScreenY}
        />
      ))}
    </div>
  );
}

type ToScreen = {
  toScreenX: (x: number) => number;
  toScreenY: (y: number) => number;
};

function AlignmentLine({
  guide,
  toScreenX,
  toScreenY,
}: { guide: AlignmentGuide } & ToScreen) {
  const vertical = guide.axis === "x";
  const at = vertical ? toScreenX(guide.pos) : toScreenY(guide.pos);
  const from = vertical ? toScreenY(guide.from) : toScreenX(guide.from);
  const to = vertical ? toScreenY(guide.to) : toScreenX(guide.to);
  const point = (along: number) =>
    vertical ? { x: at, y: along } : { x: along, y: at };
  const start = point(from);
  const end = point(to);
  const marks = [...new Set(guide.marks)].map((mark) =>
    point(vertical ? toScreenY(mark) : toScreenX(mark)),
  );

  return (
    <g stroke={ALIGNMENT_COLOR} strokeWidth={1}>
      <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
      {marks.map(({ x, y }) => (
        <path
          key={`${x}:${y}`}
          d={`M${x - MARK_SIZE} ${y - MARK_SIZE}L${x + MARK_SIZE} ${y + MARK_SIZE}M${x + MARK_SIZE} ${y - MARK_SIZE}L${x - MARK_SIZE} ${y + MARK_SIZE}`}
        />
      ))}
    </g>
  );
}

function SpacingLine({
  segment,
  toScreenX,
  toScreenY,
}: { segment: SpacingSegment } & ToScreen) {
  const horizontal = segment.axis === "x";
  const cross = horizontal
    ? toScreenY(segment.cross)
    : toScreenX(segment.cross);
  const start = horizontal
    ? toScreenX(segment.start)
    : toScreenY(segment.start);
  const end = horizontal ? toScreenX(segment.end) : toScreenY(segment.end);

  const d = horizontal
    ? `M${start} ${cross}H${end}M${start} ${cross - TICK_SIZE}V${cross + TICK_SIZE}M${end} ${cross - TICK_SIZE}V${cross + TICK_SIZE}`
    : `M${cross} ${start}V${end}M${cross - TICK_SIZE} ${start}H${cross + TICK_SIZE}M${cross - TICK_SIZE} ${end}H${cross + TICK_SIZE}`;

  return <path d={d} stroke={SPACING_COLOR} strokeWidth={1} fill="none" />;
}

function SpacingLabel({
  segment,
  toScreenX,
  toScreenY,
}: { segment: SpacingSegment } & ToScreen) {
  const middle = (segment.start + segment.end) / 2;
  const x = segment.axis === "x" ? toScreenX(middle) : toScreenX(segment.cross);
  const y = segment.axis === "x" ? toScreenY(segment.cross) : toScreenY(middle);

  return (
    <div
      className="absolute rounded-sm px-1 py-px text-[10px] leading-tight font-medium text-white tabular-nums"
      style={{
        left: x,
        top: y,
        backgroundColor: SPACING_COLOR,
        transform: "translate(-50%, -50%)",
      }}
    >
      {Math.round(segment.end - segment.start)}
    </div>
  );
}
