import { useCallback, useEffect, useRef } from "react";
import {
  useStoreApi,
  type InternalNode,
  type NodeChange,
  type NodeDimensionChange,
  type NodePositionChange,
  type ReactFlowState,
} from "@xyflow/react";
import {
  computeResizeSnap,
  computeSnap,
  unionRect,
  type ResizeEdges,
  type SnapRect,
} from "@/lib/snapGuides";
import { getResizeMinSize } from "@/lib/resizeMinSize";
import { useSnapGuidesStore } from "@/stores/snapGuidesStore";

/** Portée de l'aimant, en pixels écran (convertie en unités monde au zoom). */
const SNAP_DISTANCE_PX = 6;

/** Sous cet écart (unités monde), un bord n'a pas bougé. */
const EPSILON = 0.5;

export type SnapCandidate = { id: string; rect: SnapRect };

type SnapSession = {
  /** Les nodes traînés, ceux dont React Flow émet les positions. */
  movingIds: Set<string>;
  /** Les rectangles monde de tout le reste, figés au début du geste. */
  candidates: SnapCandidate[];
  /** Le décalage appliqué à la dernière frame, rejoué au relâcher. */
  delta: { x: number; y: number };
};

type ResizeSession = {
  nodeId: string;
  /** Origine monde du parent : la position du node lui est relative. */
  origin: { x: number; y: number };
  /** Position (relative) et taille d'avant le geste. */
  start: SnapRect;
  /** Les bords tirés, reconnus à ce qui a bougé depuis `start`. */
  edges: ResizeEdges;
  candidates: SnapCandidate[];
  /** La dernière position émise par React Flow, non aimantée. */
  rawPosition: { x: number; y: number };
  /** La taille posée à la dernière frame, rejouée au relâcher. */
  size: { width: number; height: number } | null;
};

function isMovingChange(change: NodeChange): change is NodePositionChange {
  return change.type === "position" && change.position !== undefined;
}

/** Un change de `NodeResizer` : lui seul renseigne `resizing`. */
function isResizeChange(change: NodeChange): change is NodeDimensionChange {
  return (
    change.type === "dimensions" &&
    change.resizing !== undefined &&
    change.dimensions !== undefined
  );
}

/** La portée de l'aimant en unités monde, au zoom courant. */
export function snapThreshold(zoom: number): number {
  return SNAP_DISTANCE_PX / zoom;
}

/**
 * Les rectangles monde des nodes qui peuvent aimanter, hors ceux que `skip`
 * écarte (ce qui bouge avec le geste). À figer au début du geste.
 */
export function collectSnapCandidates(
  nodeLookup: ReactFlowState["nodeLookup"],
  skip: (node: InternalNode) => boolean,
): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];
  for (const node of nodeLookup.values()) {
    if (node.hidden || skip(node)) continue;
    const { width: w, height: h } = node.measured;
    if (!w || !h) continue;
    const { x, y } = node.internals.positionAbsolute;
    candidates.push({ id: node.id, rect: { x, y, width: w, height: h } });
  }
  return candidates;
}

/**
 * Seuls les nodes à l'écran aimantent : un saut vers un alignement invisible
 * serait incompréhensible. À filtrer à chaque frame, le viewport pouvant
 * défiler pendant le geste (auto-pan au bord).
 */
export function visibleSnapRects(
  candidates: SnapCandidate[],
  {
    transform,
    width,
    height,
  }: Pick<ReactFlowState, "transform" | "width" | "height">,
  excludedIds?: ReadonlySet<string>,
): SnapRect[] {
  const [tx, ty, zoom] = transform;
  const view = {
    x: -tx / zoom,
    y: -ty / zoom,
    width: width / zoom,
    height: height / zoom,
  };
  return candidates
    .filter(
      ({ id, rect }) =>
        !excludedIds?.has(id) &&
        rect.x < view.x + view.width &&
        rect.x + rect.width > view.x &&
        rect.y < view.y + view.height &&
        rect.y + rect.height > view.y,
    )
    .map(({ rect }) => rect);
}

/**
 * Aimante les nodes traînés sur les bords, centres et espacements des nodes
 * visibles, et publie les guides à dessiner (cf. `SnapGuidesOverlay`).
 *
 * S'insère dans `handleNodeChange`, avant que les positions ne soient
 * appliquées : React Flow recalcule chaque position depuis le pointeur à
 * chaque frame (`XYDrag`), donc corriger le change suffit, sans accumuler de
 * dérive. Au relâcher, en revanche, il réémet la dernière position NON
 * aimantée (celle de ses `dragItems`) : on y rejoue le dernier décalage, sinon
 * le node sauterait hors de l'alignement au moment de le poser.
 *
 * Le redimensionnement d'un node (`NodeResizer`) passe par le même chemin :
 * seuls les bords tirés s'aimantent, sur les bords et centres des autres (cf.
 * `computeResizeSnap`). Même raisonnement : `XYResizer` recalcule la taille
 * depuis le pointeur à chaque frame, et réémet au relâcher sa dernière taille
 * NON aimantée, sur laquelle on rejoue la dernière taille posée.
 *
 * Désactivé par défaut : l'aimant n'agit que tant que Shift est maintenu, et
 * peut se prendre ou se lâcher en plein geste. Sans Shift, le node suit le
 * pointeur au pixel près, comme avant.
 */
export function useNodeSnapping() {
  const store = useStoreApi();
  const sessionRef = useRef<SnapSession | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const isShiftHeldRef = useRef(false);

  // Un ref plutôt que `useKeyHold` : l'état de Shift n'a rien à re-rendre, il
  // n'est lu qu'au fil des changes du drag.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      isShiftHeldRef.current = event.shiftKey;
    };
    // Shift relâché hors de la fenêtre : on n'en saurait rien.
    const onBlur = () => {
      isShiftHeldRef.current = false;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  const endSnapSession = useCallback(() => {
    sessionRef.current = null;
    resizeSessionRef.current = null;
    useSnapGuidesStore.getState().setGuides(null);
  }, []);

  /** Rend `changes` (un tick de `NodeResizer`) avec les bords aimantés. */
  const snapResizeChanges = useCallback(
    (changes: NodeChange[], resize: NodeDimensionChange) => {
      const id = resize.id;

      // Relâcher : la taille réémise est celle d'avant aimantation. La
      // position, elle, n'est pas réémise : `useCanvasNodes` garde la dernière
      // vue pendant le geste, déjà aimantée.
      if (!resize.resizing) {
        const session = resizeSessionRef.current;
        if (!session || session.nodeId !== id) return changes;
        endSnapSession();
        const { size } = session;
        if (!size) return changes;
        return changes.map((change) =>
          change === resize ? { ...resize, dimensions: size } : change,
        );
      }

      const state = store.getState();
      const node = state.nodeLookup.get(id);
      if (!node) return changes;

      let session = resizeSessionRef.current;
      if (!session || session.nodeId !== id) {
        // Avant application du premier change : le node est encore tel
        // qu'au début du geste.
        const parent = node.parentId
          ? state.nodeLookup.get(node.parentId)
          : null;
        session = {
          nodeId: id,
          origin: parent?.internals.positionAbsolute ?? { x: 0, y: 0 },
          start: {
            ...node.position,
            width: node.measured.width ?? 0,
            height: node.measured.height ?? 0,
          },
          edges: { left: false, right: false, top: false, bottom: false },
          // Ni lui-même, ni son contenu s'il est une frame : il le suit.
          candidates: collectSnapCandidates(
            state.nodeLookup,
            (other) => other.id === id || other.parentId === id,
          ),
          rawPosition: { ...node.position },
          size: null,
        };
        resizeSessionRef.current = session;
      }

      // Tiré par son bord gauche ou haut, le node bouge : `XYResizer` émet
      // alors sa position à chaque tick, avec celle de ses enfants corrigée
      // pour qu'ils restent en place.
      const ownPosition = changes.find(
        (change): change is NodePositionChange =>
          isMovingChange(change) && change.id === id,
      );
      if (ownPosition) session.rawPosition = { ...ownPosition.position! };

      const raw: SnapRect = {
        ...session.rawPosition,
        width: resize.dimensions!.width,
        height: resize.dimensions!.height,
      };
      const { start, edges } = session;
      edges.left ||= Math.abs(raw.x - start.x) > EPSILON;
      edges.right ||=
        !edges.left && Math.abs(raw.width - start.width) > EPSILON;
      edges.top ||= Math.abs(raw.y - start.y) > EPSILON;
      edges.bottom ||=
        !edges.top && Math.abs(raw.height - start.height) > EPSILON;

      if (!isShiftHeldRef.current) {
        session.size = { width: raw.width, height: raw.height };
        useSnapGuidesStore.getState().setGuides(null);
        return changes;
      }

      const { origin } = session;
      const minSize = getResizeMinSize(id);
      const { rect, guides } = computeResizeSnap(
        { ...raw, x: raw.x + origin.x, y: raw.y + origin.y },
        edges,
        visibleSnapRects(session.candidates, state),
        snapThreshold(state.transform[2]),
        {
          width:
            (edges.left ? minSize?.widthFromLeft : minSize?.widthFromRight) ??
            0,
          height:
            (edges.top ? minSize?.heightFromTop : minSize?.heightFromBottom) ??
            0,
        },
      );
      useSnapGuidesStore.getState().setGuides(guides);
      const size = { width: rect.width, height: rect.height };
      session.size = size;
      // Non nuls seulement pour un bord gauche ou haut aimanté.
      const dx = rect.x - origin.x - raw.x;
      const dy = rect.y - origin.y - raw.y;

      return changes.map((change) => {
        if (change === resize) return { ...resize, dimensions: size };
        if (!isMovingChange(change) || (dx === 0 && dy === 0)) return change;
        // Le node avance d'autant que son bord ; ses enfants reculent
        // d'autant, pour rester où ils sont à l'écran.
        const sign =
          change.id === id
            ? 1
            : state.nodeLookup.get(change.id)?.parentId === id
              ? -1
              : 0;
        if (sign === 0) return change;
        return {
          ...change,
          position: {
            x: change.position!.x + sign * dx,
            y: change.position!.y + sign * dy,
          },
        };
      });
    },
    [store, endSnapSession],
  );

  /**
   * Rend `changes` avec les positions traînées aimantées.
   *
   * `excludedIds` : des nodes qui bougent avec le geste sans être dans les
   * changes (les descendants entraînés au Ctrl) — s'aligner sur eux n'aurait
   * pas de sens.
   */
  const snapChanges = useCallback(
    (changes: NodeChange[], excludedIds?: ReadonlySet<string>) => {
      const resize = changes.find(isResizeChange);
      if (resize) return snapResizeChanges(changes, resize);

      const moving = changes.filter(isMovingChange);
      if (moving.length === 0) return changes;

      const shiftChanges = (
        ids: Set<string>,
        delta: { x: number; y: number },
      ) =>
        delta.x === 0 && delta.y === 0
          ? changes
          : changes.map((change) =>
              isMovingChange(change) && ids.has(change.id)
                ? {
                    ...change,
                    position: {
                      x: change.position!.x + delta.x,
                      y: change.position!.y + delta.y,
                    },
                  }
                : change,
            );

      // Relâcher : la position réémise est celle d'avant aimantation.
      if (!moving.some((change) => change.dragging)) {
        const session = sessionRef.current;
        if (!session) return changes;
        endSnapSession();
        return shiftChanges(session.movingIds, session.delta);
      }

      const state = store.getState();
      const { nodeLookup, transform } = state;

      let session = sessionRef.current;
      const movingIds = new Set(moving.map((change) => change.id));
      if (
        !session ||
        session.movingIds.size !== movingIds.size ||
        [...movingIds].some((id) => !session!.movingIds.has(id))
      ) {
        const candidates = collectSnapCandidates(
          nodeLookup,
          // Le contenu d'une frame traînée suit sa frame.
          (node) =>
            movingIds.has(node.id) ||
            (node.parentId !== undefined && movingIds.has(node.parentId)),
        );
        session = { movingIds, candidates, delta: { x: 0, y: 0 } };
        sessionRef.current = session;
      }

      if (!isShiftHeldRef.current) {
        session.delta = { x: 0, y: 0 };
        useSnapGuidesStore.getState().setGuides(null);
        return changes;
      }

      // La boîte englobante de ce qui bouge, en coordonnées monde : les
      // positions d'un node de frame sont relatives à sa frame.
      const movingRects: SnapRect[] = [];
      for (const change of moving) {
        const node = nodeLookup.get(change.id);
        if (!node?.measured.width || !node.measured.height) continue;
        const parent = node.parentId ? nodeLookup.get(node.parentId) : null;
        const origin = parent?.internals.positionAbsolute ?? { x: 0, y: 0 };
        movingRects.push({
          x: change.position!.x + origin.x,
          y: change.position!.y + origin.y,
          width: node.measured.width,
          height: node.measured.height,
        });
      }
      const movingRect = unionRect(movingRects);
      if (!movingRect) return changes;

      const others = visibleSnapRects(session.candidates, state, excludedIds);

      const { dx, dy, guides } = computeSnap(
        movingRect,
        others,
        snapThreshold(transform[2]),
      );
      session.delta = { x: dx, y: dy };
      useSnapGuidesStore.getState().setGuides(guides);
      return shiftChanges(session.movingIds, session.delta);
    },
    [store, endSnapSession, snapResizeChanges],
  );

  return { snapChanges, endSnapSession };
}
