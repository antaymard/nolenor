import type { Node, Viewport } from "@xyflow/react";
import { centerOf } from "@/lib/frameMembership";

/**
 * Le cadrage qu'un node `viewport` enregistre : un centre en coordonnées MONDE
 * et un zoom.
 *
 * React Flow travaille en `{ x, y, zoom }`, où `x`/`y` sont l'offset écran du
 * pane. Stocker ça tel quel — ce que faisaient les slideshows et les hotspots —
 * lie le cadrage à la taille de la fenêtre au moment de la capture : le même
 * enregistrement ne montre pas la même zone sur un 13" et sur un 27", et
 * redimensionner sa fenêtre décale tous ses repères. Le centre monde n'a pas ce
 * défaut, au prix d'une conversion à l'aller et au retour.
 */
/** Les dimensions du pane React Flow — un DOMRect en est un. */
export type PaneSize = { width: number; height: number };

export type ViewportFraming = {
  cx: number;
  cy: number;
  zoom: number;
};

/** Tolérances de `getFramingMatch`. */
const HERE_DISTANCE_PX = 4;

/**
 * La marge que la cible doit laisser aux bords du pane pour cesser d'être
 * « ici » — en fraction de pane, appliquée de chaque côté. La zone « ici » est
 * donc les 80 % centraux de la vue.
 *
 * Ne concerne que les cibles NODE. Un node parfaitement visible n'appelle
 * aucune navigation : annoncer « 0,1 écran » sous prétexte qu'il n'est pas pile
 * au centre ne dit rien d'utile. Les cadrages enregistrés gardent leurs propres
 * seuils (`getFramingMatch`), où le zoom compte autant que la position.
 */
const HERE_VIEWPORT_INSET = 0.1;
const HERE_ZOOM_RATIO_TOLERANCE = 0.015;
const NEAR_ZOOM_RATIO_MIN = 0.5;
const NEAR_ZOOM_RATIO_MAX = 2;

/** La durée d'animation utilisée par toutes les navigations du canvas. */
export const VIEWPORT_TRANSITION_MS = 500;

/**
 * Les bornes de zoom du canvas.
 *
 * Passées à `<ReactFlow>` (cf. `CanvasFlow`) *et* appliquées au parse du param
 * d'URL : sans source unique, un cadrage venu d'un lien pourrait sortir des
 * bornes que l'utilisateur peut atteindre à la molette.
 */
export const CANVAS_MIN_ZOOM = 0.1;
export const CANVAS_MAX_ZOOM = 4;

/**
 * Le rectangle du pane React Flow.
 *
 * Et non `window.innerWidth/Height` : le canvas vit dans `CanvasSidebar`, donc
 * le pane est plus étroit que la fenêtre dès que la sidebar est ouverte. Même
 * lookup que `toFlowPosition` (`useCanvasPointerPosition.ts`).
 */
function getPaneRect(): DOMRect | null {
  return document.querySelector(".react-flow")?.getBoundingClientRect() ?? null;
}

/**
 * Les dimensions du pane, ou `null` s'il n'est pas monté.
 *
 * Pour les appelants impératifs hors React (poignée du command center) : les
 * composants abonnés liront plutôt `state.width`/`state.height` du store.
 */
export function getPaneSize(): PaneSize | null {
  const rect = getPaneRect();
  if (!rect || rect.width === 0 || rect.height === 0) return null;
  return { width: rect.width, height: rect.height };
}

/**
 * Le cadrage courant, lu depuis le viewport React Flow et la taille du pane.
 *
 * `world = (écranRelatifAuPane − viewport) / zoom`, appliqué au centre du pane.
 */
export function framingFromViewport(
  viewport: Viewport,
  paneSize: PaneSize,
): ViewportFraming {
  return {
    cx: (paneSize.width / 2 - viewport.x) / viewport.zoom,
    cy: (paneSize.height / 2 - viewport.y) / viewport.zoom,
    zoom: viewport.zoom,
  };
}

/** L'inverse : `viewport = écranRelatifAuPane − world × zoom`. */
export function viewportFromFraming(
  framing: ViewportFraming,
  paneSize: PaneSize,
): Viewport {
  return {
    x: paneSize.width / 2 - framing.cx * framing.zoom,
    y: paneSize.height / 2 - framing.cy * framing.zoom,
    zoom: framing.zoom,
  };
}

/**
 * Capture le cadrage courant, ou `null` si le pane n'est pas monté.
 *
 * `getViewport` vient de `useReactFlow()` : on le passe plutôt que d'appeler le
 * hook ici, pour que cette fonction reste pure et testable.
 */
export function captureFraming(
  getViewport: () => Viewport,
): ViewportFraming | null {
  const paneRect = getPaneRect();
  if (!paneRect) return null;
  return framingFromViewport(getViewport(), paneRect);
}

/**
 * Ramène la vue sur un cadrage enregistré.
 *
 * Passe par `setViewport` et non `setCenter` : c'est l'API déjà employée par
 * toutes les navigations du canvas, et le calcul est de toute façon symétrique
 * de la capture.
 */
export function applyFraming(
  framing: ViewportFraming,
  setViewport: (viewport: Viewport, options?: { duration?: number }) => void,
  duration = VIEWPORT_TRANSITION_MS,
): void {
  const paneRect = getPaneRect();
  if (!paneRect) return;
  setViewport(viewportFromFraming(framing, paneRect), { duration });
}

export type FramingMatch = "here" | "near" | null;

/**
 * À quel point la vue courante correspond à un cadrage enregistré.
 *
 * - `here` : les centres sont à moins de 4 px écran et les zooms à 1,5 % près.
 * - `near` : le centre visé est dans le cadre courant, à un facteur 2 de zoom
 *   près — « tu y es presque », qui évite que l'indicateur clignote au moindre
 *   micro-pan.
 * - `null` : ailleurs.
 *
 * Deux hypoténuses et un ratio : appelable à chaque frame de pan pour la
 * poignée de viewport nodes d'un canvas.
 */
export function getFramingMatch(
  target: ViewportFraming,
  current: ViewportFraming,
  paneSize: PaneSize,
): FramingMatch {
  // Un zoom nul ou négatif ne peut pas venir de React Flow (minZoom 0.1), mais
  // il viendrait d'une value corrompue : la division serait alors absurde.
  if (!(target.zoom > 0) || !(current.zoom > 0)) return null;

  const dxWorld = current.cx - target.cx;
  const dyWorld = current.cy - target.cy;
  const distancePx = Math.hypot(dxWorld, dyWorld) * current.zoom;
  const zoomRatio = current.zoom / target.zoom;

  if (
    distancePx < HERE_DISTANCE_PX &&
    Math.abs(zoomRatio - 1) < HERE_ZOOM_RATIO_TOLERANCE
  ) {
    return "here";
  }

  const isTargetOnScreen =
    Math.abs(dxWorld) * current.zoom < paneSize.width / 2 &&
    Math.abs(dyWorld) * current.zoom < paneSize.height / 2;

  if (
    isTargetOnScreen &&
    zoomRatio > NEAR_ZOOM_RATIO_MIN &&
    zoomRatio < NEAR_ZOOM_RATIO_MAX
  ) {
    return "near";
  }

  return null;
}

export type FramingDelta = {
  /**
   * `here` quand la cible ne demande aucune navigation : mêmes seuils que
   * `getFramingMatch` pour un cadrage (position ET zoom), présence dans les
   * 80 % centraux du pane pour un node (cf. `HERE_VIEWPORT_INSET`).
   */
  match: FramingMatch;
  /** Distance entre les centres, en fractions d'écran (1 ≈ un écran). */
  screens: number;
  /**
   * Cap écran vers la cible, en degrés horaires depuis le haut — base d'une
   * flèche qui pointe vers le haut (`rotate()` CSS tourne en horaire).
   * Forcé à 0 sous 5 % d'écran, où l'angle n'est que du bruit.
   */
  angleDeg: number;
  /**
   * `current.zoom / target.zoom` — `null` pour une cible node, qui n'a pas de
   * zoom de référence.
   */
  zoomRatio: number | null;
  /** Distance entre les centres, en px écran (pour le tooltip). */
  distancePx: number;
};

/**
 * Une cible de l'indicateur de cap : un cadrage enregistré (node `viewport`)
 * ou la position d'un node du canvas.
 */
export type DeltaTarget =
  | { kind: "framing"; framing: ViewportFraming }
  | { kind: "node"; nodeId: string };

/**
 * Seuil « centré » partagé : snap de l'angle à 0, branche zoom du badge,
 * égalité du hook.
 */
export const CENTERED_SCREENS = 0.05;

/** Passée à `centerOf` pour un node de premier niveau : rien à résoudre. */
const NO_PARENTS: Map<string, Node> = new Map();

/**
 * Le centre MONDE d'une cible : le cadrage lui-même, ou le centre du node.
 * Node introuvable (supprimé) → `null`.
 *
 * `centerOf` et pas `position + taille / 2` : un node qui vit dans une frame
 * porte une position RELATIVE à elle, et la lire telle quelle plaçait la cible
 * près de l'origine du monde — flèche vers le néant, distance fausse. Le clic
 * pour y aller, lui, n'avait pas le problème : `useGoToNode` passe par
 * `fitView`, qui lit les positions absolues que React Flow maintient. D'où une
 * flèche qui mentait sur une navigation qui marchait.
 *
 * La carte des parents ne se construit que pour un node en frame : le cas
 * courant reste le seul `find` d'avant.
 */
export function resolveDeltaPoint(
  target: DeltaTarget,
  nodes: ReadonlyArray<Node>,
): { x: number; y: number } | null {
  if (target.kind === "framing") {
    return { x: target.framing.cx, y: target.framing.cy };
  }
  const node = nodes.find((n) => n.id === target.nodeId);
  if (!node) return null;
  const byId = node.parentId
    ? new Map(nodes.map((n) => [n.id, n]))
    : NO_PARENTS;
  return centerOf(node, byId);
}

/**
 * Où se trouve un point monde par rapport à la vue courante : cap et distance
 * pour l'indicateur de navigation.
 *
 * Même repère que `getFramingMatch` (centre monde + zoom courant), mais
 * continu au lieu de discrétisé : c'est l'appelant (hook) qui quantifie pour
 * borner les re-renders, pas cette fonction pure.
 */
export function getPointDelta(
  point: { x: number; y: number },
  current: ViewportFraming,
  paneSize: PaneSize,
  targetZoom: number | null,
): FramingDelta | null {
  if (!(current.zoom > 0)) return null;
  if (targetZoom !== null && !(targetZoom > 0)) return null;
  if (paneSize.width <= 0 || paneSize.height <= 0) return null;

  const dxPx = (point.x - current.cx) * current.zoom;
  const dyPx = (point.y - current.cy) * current.zoom;
  const distancePx = Math.hypot(dxPx, dyPx);
  const screens = Math.hypot(dxPx / paneSize.width, dyPx / paneSize.height);

  // Cible node : « ici » = visible sans avoir à naviguer, soit dans les 80 %
  // centraux du pane. Test par axe et non par rayon — la vue est un rectangle,
  // « dans l'écran moins 10 % » est un test de rectangle. Le `screens` rendu
  // reste, lui, une distance de centre à centre : le premier chiffre affiché
  // vaut donc ~0,4, et un « 0,4 » veut dire la même chose ici et sur les
  // badges des repères de viewport.
  const insetFromCenter = 0.5 - HERE_VIEWPORT_INSET;
  const isNodeHere =
    Math.abs(dxPx) <= paneSize.width * insetFromCenter &&
    Math.abs(dyPx) <= paneSize.height * insetFromCenter;

  return {
    match:
      targetZoom === null
        ? isNodeHere
          ? "here"
          : null
        : getFramingMatch(
            { cx: point.x, cy: point.y, zoom: targetZoom },
            current,
            paneSize,
          ),
    screens,
    angleDeg:
      screens < CENTERED_SCREENS
        ? 0
        : (Math.atan2(dxPx, -dyPx) * 180) / Math.PI,
    zoomRatio: targetZoom === null ? null : current.zoom / targetZoom,
    distancePx,
  };
}

/**
 * Où se trouve un cadrage enregistré par rapport à la vue courante : cap et
 * distance pour l'indicateur des listes de repères.
 */
export function getFramingDelta(
  target: ViewportFraming,
  current: ViewportFraming,
  paneSize: PaneSize,
): FramingDelta | null {
  return getPointDelta(
    { x: target.cx, y: target.cy },
    current,
    paneSize,
    target.zoom,
  );
}

/** Lit un `values.view` de nodeData, en tolérant une value absente ou abîmée. */
export function readFraming(value: unknown): ViewportFraming | null {
  if (typeof value !== "object" || value === null) return null;
  const { cx, cy, zoom } = value as Record<string, unknown>;
  if (
    typeof cx !== "number" ||
    typeof cy !== "number" ||
    typeof zoom !== "number" ||
    !Number.isFinite(cx) ||
    !Number.isFinite(cy) ||
    !(zoom > 0)
  ) {
    return null;
  }
  return { cx, cy, zoom };
}

/** Le séparateur du param `?v=` — un cadrage y tient en trois nombres. */
const PARAM_SEPARATOR = ",";

/**
 * Le cadrage tel qu'il voyage dans l'URL (`?v=cx,cy,zoom`).
 *
 * `cx`/`cy` à l'entier — l'unité monde est le pixel, le sous-pixel n'est que du
 * bruit dans un lien — et `zoom` à trois décimales : l'URL reste courte, la
 * précision reste sous le seuil de l'œil.
 */
export function framingToParam(framing: ViewportFraming): string {
  return [
    Math.round(framing.cx),
    Math.round(framing.cy),
    Number(framing.zoom.toFixed(3)),
  ].join(PARAM_SEPARATOR);
}

/**
 * Lit un `?v=cx,cy,zoom` en tolérant n'importe quoi : lien tronqué, URL
 * bricolée à la main, param vide. Même contrat que `readFraming` — `null` dès
 * que ce ne sont pas trois nombres exploitables, et l'appelant retombe alors
 * sur le `defaultViewport`.
 *
 * Le zoom est *borné* plutôt que rejeté : un lien qui demande 9999 doit
 * atterrir au zoom maximum, pas échouer silencieusement. Ça couvre aussi
 * l'infini, que `zoom > 0` laisse passer.
 */
export function framingFromParam(
  raw: string | undefined,
): ViewportFraming | null {
  if (!raw) return null;

  const parts = raw.split(PARAM_SEPARATOR);
  if (parts.length !== 3) return null;

  const [cx, cy, zoom] = parts.map((part) => Number(part.trim()));
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || !(zoom > 0)) return null;

  return {
    cx,
    cy,
    zoom: Math.min(Math.max(zoom, CANVAS_MIN_ZOOM), CANVAS_MAX_ZOOM),
  };
}
