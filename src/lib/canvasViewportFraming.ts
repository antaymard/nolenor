import type { Node, Viewport } from "@xyflow/react";
import { centerOf } from "@/lib/frameMembership";

/**
 * Un cadrage de canvas : un centre en coordonnées MONDE et un zoom. C'est la
 * forme que prend la vue quand elle voyage — aujourd'hui dans le `?v=` d'un
 * lien partagé (cf. `framingToParam` / `useInitialViewportFromUrl`).
 *
 * React Flow travaille en `{ x, y, zoom }`, où `x`/`y` sont l'offset écran du
 * pane. Transporter ça tel quel lierait le cadrage à la taille de la fenêtre
 * au moment de la capture : le même lien ne montrerait pas la même zone sur un
 * 13" et sur un 27". Le centre monde n'a pas ce défaut, au prix d'une
 * conversion à l'aller et au retour.
 */
/** Les dimensions du pane React Flow — un DOMRect en est un. */
export type PaneSize = { width: number; height: number };

export type ViewportFraming = {
  cx: number;
  cy: number;
  zoom: number;
};

/**
 * La marge que la cible doit laisser aux bords du pane pour cesser d'être
 * « ici » — en fraction de pane, appliquée de chaque côté. La zone « ici » est
 * donc les 80 % centraux de la vue.
 *
 * Un node parfaitement visible n'appelle aucune navigation : annoncer
 * « 0,1 écran » sous prétexte qu'il n'est pas pile au centre ne dit rien
 * d'utile.
 */
const HERE_VIEWPORT_INSET = 0.1;

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

export type FramingDelta = {
  /**
   * `true` quand la cible ne demande aucune navigation : le node est dans les
   * 80 % centraux du pane (cf. `HERE_VIEWPORT_INSET`).
   */
  here: boolean;
  /** Distance entre les centres, en fractions d'écran (1 ≈ un écran). */
  screens: number;
  /**
   * Cap écran vers la cible, en degrés horaires depuis le haut — base d'une
   * flèche qui pointe vers le haut (`rotate()` CSS tourne en horaire).
   * Forcé à 0 sous 5 % d'écran, où l'angle n'est que du bruit.
   */
  angleDeg: number;
};

/** La cible de l'indicateur de cap : un node, une sélection, ou un point monde. */
export type DeltaTarget =
  | { nodeId: string }
  | { nodeIds: readonly string[] }
  | { point: { x: number; y: number } };

/**
 * Seuil « centré » partagé : snap de l'angle à 0 et égalité du hook.
 */
export const CENTERED_SCREENS = 0.05;

/** Passée à `centerOf` pour un node de premier niveau : rien à résoudre. */
const NO_PARENTS: Map<string, Node> = new Map();

/**
 * La carte `id → node` d'un tableau de nodes, mémoïsée par son identité.
 *
 * `resolveDeltaPoint` vit dans un sélecteur qui s'exécute à chaque frame de
 * pan : or un pan ne change que le `transform`, le tableau `state.nodes` garde
 * son identité — toutes les frames au-delà de la première lisent donc la
 * carte au lieu de la reconstruire. Quand les nodes changent (un drag remplace
 * le tableau), elle se reconstruit une fois par identité, et cette construction
 * est partagée par tous les indicateurs qui lisent le même tableau.
 */
const nodesByIdCache = new WeakMap<ReadonlyArray<Node>, Map<string, Node>>();

function byIdOf(nodes: ReadonlyArray<Node>): Map<string, Node> {
  let byId = nodesByIdCache.get(nodes);
  if (byId === undefined) {
    byId = new Map(nodes.map((node) => [node.id, node]));
    nodesByIdCache.set(nodes, byId);
  }
  return byId;
}

/**
 * Le centre MONDE de la cible. Node introuvable (supprimé) → `null`.
 *
 * `centerOf` et pas `position + taille / 2` : un node qui vit dans une frame
 * porte une position RELATIVE à elle, et la lire telle quelle plaçait la cible
 * près de l'origine du monde — flèche vers le néant, distance fausse. Le clic
 * pour y aller, lui, n'avait pas le problème : `useGoToNode` passe par
 * `fitView`, qui lit les positions absolues que React Flow maintient. D'où une
 * flèche qui mentait sur une navigation qui marchait.
 *
 * La carte des parents ne se paie que pour un node en frame, et via `byIdOf`
 * : le cas courant reste le seul `find` d'avant.
 *
 * Une sélection se résout au centre de la boîte qui englobe ses nodes encore
 * vivants — `null` quand il n'en reste aucun. C'est le point que `fitView`
 * visera au centre de la vue : cap et distance annoncent donc la navigation
 * réelle, là où un centroïde fausserait la flèche dès qu'un node est loin du
 * groupe.
 */
export function resolveDeltaPoint(
  target: DeltaTarget,
  nodes: ReadonlyArray<Node>,
): { x: number; y: number } | null {
  if ("point" in target) return target.point;
  if ("nodeIds" in target) {
    const wanted = new Set(target.nodeIds);
    const byId = byIdOf(nodes);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let found = false;
    for (const node of nodes) {
      if (!wanted.has(node.id)) continue;
      const point = centerOf(node, byId);
      if (point.x < minX) minX = point.x;
      if (point.y < minY) minY = point.y;
      if (point.x > maxX) maxX = point.x;
      if (point.y > maxY) maxY = point.y;
      found = true;
    }
    if (!found) return null;
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }
  const node = nodes.find((n) => n.id === target.nodeId);
  if (!node) return null;
  const byId = node.parentId ? byIdOf(nodes) : NO_PARENTS;
  return centerOf(node, byId);
}

/**
 * Où se trouve un point monde par rapport à la vue courante : cap et distance
 * pour l'indicateur de navigation.
 *
 * Continu et non discrétisé : c'est l'appelant (hook) qui quantifie pour
 * borner les re-renders, pas cette fonction pure.
 */
export function getPointDelta(
  point: { x: number; y: number },
  current: ViewportFraming,
  paneSize: PaneSize,
): FramingDelta | null {
  if (!(current.zoom > 0)) return null;
  if (paneSize.width <= 0 || paneSize.height <= 0) return null;

  const dxPx = (point.x - current.cx) * current.zoom;
  const dyPx = (point.y - current.cy) * current.zoom;
  const screens = Math.hypot(dxPx / paneSize.width, dyPx / paneSize.height);

  // « Ici » = visible sans avoir à naviguer, soit dans les 80 % centraux du
  // pane. Test par axe et non par rayon — la vue est un rectangle, « dans
  // l'écran moins 10 % » est un test de rectangle. Le `screens` rendu reste,
  // lui, une distance de centre à centre : le premier chiffre affiché vaut
  // donc ~0,4.
  const insetFromCenter = 0.5 - HERE_VIEWPORT_INSET;

  return {
    here:
      Math.abs(dxPx) <= paneSize.width * insetFromCenter &&
      Math.abs(dyPx) <= paneSize.height * insetFromCenter,
    screens,
    angleDeg:
      screens < CENTERED_SCREENS
        ? 0
        : (Math.atan2(dxPx, -dyPx) * 180) / Math.PI,
  };
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
 * bricolée à la main, param vide. `null` dès que ce ne sont pas trois nombres
 * exploitables, et l'appelant retombe alors sur le `defaultViewport`.
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
