import { useCallback, useEffect, useRef } from "react";
import {
  useStoreApi,
  type NodeChange,
  type NodePositionChange,
} from "@xyflow/react";
import { computeSnap, unionRect, type SnapRect } from "@/lib/snapGuides";
import { useSnapGuidesStore } from "@/stores/snapGuidesStore";

/** Portée de l'aimant, en pixels écran (convertie en unités monde au zoom). */
const SNAP_DISTANCE_PX = 6;

type SnapSession = {
  /** Les nodes traînés, ceux dont React Flow émet les positions. */
  movingIds: Set<string>;
  /** Les rectangles monde de tout le reste, figés au début du geste. */
  candidates: Array<{ id: string; rect: SnapRect }>;
  /** Le décalage appliqué à la dernière frame, rejoué au relâcher. */
  delta: { x: number; y: number };
};

function isMovingChange(change: NodeChange): change is NodePositionChange {
  return change.type === "position" && change.position !== undefined;
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
 * Désactivé par défaut : l'aimant n'agit que tant que Shift est maintenu, et
 * peut se prendre ou se lâcher en plein geste. Sans Shift, le node suit le
 * pointeur au pixel près, comme avant.
 */
export function useNodeSnapping() {
  const store = useStoreApi();
  const sessionRef = useRef<SnapSession | null>(null);
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
    useSnapGuidesStore.getState().setGuides(null);
  }, []);

  /**
   * Rend `changes` avec les positions traînées aimantées.
   *
   * `excludedIds` : des nodes qui bougent avec le geste sans être dans les
   * changes (les descendants entraînés au Ctrl) — s'aligner sur eux n'aurait
   * pas de sens.
   */
  const snapChanges = useCallback(
    (changes: NodeChange[], excludedIds?: ReadonlySet<string>) => {
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

      const { nodeLookup, transform, width, height } = store.getState();

      let session = sessionRef.current;
      const movingIds = new Set(moving.map((change) => change.id));
      if (
        !session ||
        session.movingIds.size !== movingIds.size ||
        [...movingIds].some((id) => !session!.movingIds.has(id))
      ) {
        const candidates: SnapSession["candidates"] = [];
        for (const node of nodeLookup.values()) {
          if (movingIds.has(node.id) || node.hidden) continue;
          // Le contenu d'une frame traînée suit sa frame.
          if (node.parentId && movingIds.has(node.parentId)) continue;
          const { width: w, height: h } = node.measured;
          if (!w || !h) continue;
          const { x, y } = node.internals.positionAbsolute;
          candidates.push({ id: node.id, rect: { x, y, width: w, height: h } });
        }
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

      // Seuls les nodes à l'écran aimantent : un saut vers un alignement
      // invisible serait incompréhensible. Filtré à chaque frame, le viewport
      // pouvant défiler pendant le geste (auto-pan au bord).
      const [tx, ty, zoom] = transform;
      const view = {
        x: -tx / zoom,
        y: -ty / zoom,
        width: width / zoom,
        height: height / zoom,
      };
      const others = session.candidates
        .filter(
          ({ id, rect }) =>
            !excludedIds?.has(id) &&
            rect.x < view.x + view.width &&
            rect.x + rect.width > view.x &&
            rect.y < view.y + view.height &&
            rect.y + rect.height > view.y,
        )
        .map(({ rect }) => rect);

      const { dx, dy, guides } = computeSnap(
        movingRect,
        others,
        SNAP_DISTANCE_PX / zoom,
      );
      session.delta = { x: dx, y: dy };
      useSnapGuidesStore.getState().setGuides(guides);
      return shiftChanges(session.movingIds, session.delta);
    },
    [store, endSnapSession],
  );

  return { snapChanges, endSnapSession };
}
