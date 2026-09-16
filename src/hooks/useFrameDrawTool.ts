import { useCallback, useEffect, useRef, useState } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import { useHotkey } from "@tanstack/react-hotkeys";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCanvasHotkeysEnabled } from "@/hooks/useCanvasHotkeysEnabled";
import { useCreateNode } from "@/hooks/useCreateNode";
import { useUpdateCanvasNode } from "@/hooks/useUpdateCanvasNode";
import { withUndoTransaction } from "@/stores/canvasHistoryStore";

/**
 * En deçà, le geste est un clic manqué et pas un tracé : on annule plutôt que
 * de poser une frame minuscule que l'utilisateur devra retrouver pour la
 * supprimer.
 */
const MIN_DRAWN_SIZE = 20;

type ScreenPoint = { x: number; y: number };

/** Le rectangle en cours de tracé, en pixels relatifs au conteneur du canvas. */
export type DrawnRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

function toRect(a: ScreenPoint, b: ScreenPoint) {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/**
 * L'outil « tracer une frame » : la souris dessine un rectangle, le relâcher
 * crée la frame et y fait entrer ce qu'elle englobe.
 *
 * Le geste vit ici et pas dans `CanvasFlow` parce qu'il est un mode complet —
 * il désactive le lasso, le pan et le drag des nodes le temps du tracé — et
 * que `CanvasFlow` a déjà la charge du comportement normal du canvas.
 *
 * Tout le geste tient dans une seule entrée d'historique : un Ctrl+Z après un
 * tracé rend le canvas exactement tel qu'il était, frame retirée ET nodes
 * ressortis. C'est pour ça que la création est attendue (`await settled`)
 * avant le reparentage : `parentId` doit désigner un node que le serveur
 * connaît.
 *
 * Les trois portes du mode sont ici : `F` pour entrer et sortir, Échap pour
 * sortir, et le relâcher du tracé qui rend la main tout seul.
 */
export function useFrameDrawTool({
  canEdit,
  isTouch,
}: {
  canEdit: boolean;
  isTouch: boolean;
}) {
  const tool = useCanvasStore((state) => state.tool);
  const setTool = useCanvasStore((state) => state.setTool);
  const { screenToFlowPosition, getNodes } = useReactFlow();
  const { createNode } = useCreateNode();
  const { updateCanvasNodes } = useUpdateCanvasNode();
  const hotkeysEnabled = useCanvasHotkeysEnabled({ canEdit, isTouch });

  const isFrameTool = canEdit && tool === "frame";

  // Bascule, et pas simple entrée : le bouton de la toolbar bascule lui aussi,
  // les deux commandes doivent dire la même chose.
  useHotkey(
    "F",
    (event) => {
      // Une touche maintenue rejouerait le binding et ferait clignoter le mode
      // — `requireReset` est faux par défaut.
      if (event.repeat) return;
      setTool(tool === "frame" ? "edit" : "frame");
    },
    { enabled: hotkeysEnabled, ignoreInputs: true },
  );

  const startRef = useRef<ScreenPoint | null>(null);
  const [rect, setRect] = useState<DrawnRect | null>(null);

  // Quitter le mode (Échap, changement d'outil, démontage) ne doit pas laisser
  // un rectangle fantôme à l'écran.
  useEffect(() => {
    if (isFrameTool) return;
    startRef.current = null;
    setRect(null);
  }, [isFrameTool]);

  useEffect(() => {
    if (!isFrameTool) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setTool("edit");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFrameTool, setTool]);

  /**
   * Les nodes à faire entrer dans la frame : ceux que le rectangle contient
   * ENTIÈREMENT.
   *
   * Contenance totale et non chevauchement : on trace autour de ce qu'on veut
   * grouper, et happer un node qu'on a seulement effleuré du coin surprend —
   * d'autant que rien ne le signale pendant le tracé.
   *
   * Exclus : les frames (pas de frame dans une frame) et les nodes qui
   * appartiennent déjà à une autre frame (tracer par-dessus ne doit pas lui
   * voler son contenu).
   */
  const collectEnclosedNodes = useCallback(
    (worldRect: { x1: number; y1: number; x2: number; y2: number }): Node[] =>
      getNodes().filter((node) => {
        if (node.type === "frame" || node.parentId) return false;
        const width = node.measured?.width ?? node.width ?? 0;
        const height = node.measured?.height ?? node.height ?? 0;
        return (
          node.position.x >= worldRect.x1 &&
          node.position.y >= worldRect.y1 &&
          node.position.x + width <= worldRect.x2 &&
          node.position.y + height <= worldRect.y2
        );
      }),
    [getNodes],
  );

  const commit = useCallback(
    async (drawn: DrawnRect, origin: DOMRect) => {
      const topLeft = screenToFlowPosition({
        x: origin.left + drawn.left,
        y: origin.top + drawn.top,
      });
      const bottomRight = screenToFlowPosition({
        x: origin.left + drawn.left + drawn.width,
        y: origin.top + drawn.top + drawn.height,
      });

      // Capturés AVANT la création : le node frame apparaît en local-first,
      // donc il serait déjà dans `getNodes()` au moment du filtre.
      const enclosed = collectEnclosedNodes({
        x1: topLeft.x,
        y1: topLeft.y,
        x2: bottomRight.x,
        y2: bottomRight.y,
      });

      await withUndoTransaction("Create frame", async () => {
        const { nodeId, settled } = createNode({
          node: {
            id: "",
            type: "frame",
            position: topLeft,
            width: bottomRight.x - topLeft.x,
            height: bottomRight.y - topLeft.y,
            measured: {
              width: bottomRight.x - topLeft.x,
              height: bottomRight.y - topLeft.y,
            },
            data: {},
          },
          position: topLeft,
          autoEdit: true,
        });

        // Le reparentage ne peut pas partir avant que le serveur connaisse la
        // frame : `parentId` désigne un llmId, et un patch qui pointe sur un
        // node inconnu est rejeté.
        await settled;

        if (enclosed.length === 0) return;
        await updateCanvasNodes(
          enclosed.map((node) => ({
            nodeId: node.id,
            props: {
              parentId: nodeId,
              // Les positions d'un enfant sont relatives à sa frame.
              position: {
                x: node.position.x - topLeft.x,
                y: node.position.y - topLeft.y,
              },
            },
          })),
        );
      });
    },
    [
      collectEnclosedNodes,
      createNode,
      screenToFlowPosition,
      updateCanvasNodes,
    ],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isFrameTool || event.button !== 0) return;
      const origin = event.currentTarget.getBoundingClientRect();
      const point = {
        x: event.clientX - origin.left,
        y: event.clientY - origin.top,
      };
      startRef.current = point;
      setRect(toRect(point, point));
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [isFrameTool],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      if (!start) return;
      const origin = event.currentTarget.getBoundingClientRect();
      setRect(
        toRect(start, {
          x: event.clientX - origin.left,
          y: event.clientY - origin.top,
        }),
      );
    },
    [],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      if (!start) return;
      const origin = event.currentTarget.getBoundingClientRect();
      const drawn = toRect(start, {
        x: event.clientX - origin.left,
        y: event.clientY - origin.top,
      });

      startRef.current = null;
      setRect(null);
      // L'outil rend la main quoi qu'il arrive : une frame se trace en un
      // geste, rester en mode dessin après coup n'aiderait personne.
      setTool("edit");

      if (drawn.width < MIN_DRAWN_SIZE || drawn.height < MIN_DRAWN_SIZE) return;
      void commit(drawn, origin);
    },
    [commit, setTool],
  );

  return {
    isFrameTool,
    rect,
    handlers: { onPointerDown, onPointerMove, onPointerUp },
  };
}
