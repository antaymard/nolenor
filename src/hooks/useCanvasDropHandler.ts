import { useCallback, useEffect, useRef, useState } from "react";
import { useReactFlow, useViewport, type XYPosition } from "@xyflow/react";
import { useCanvasContentIngest } from "./useCanvasContentIngest";

/**
 * Les types de `DataTransfer` qu'on sait ingérer. Tout drag qui n'annonce que
 * des types internes (réordonnancement dnd-kit, drag d'un node React Flow…)
 * passe à travers sans overlay ni interception.
 */
const ACCEPTED_TRANSFER_TYPES = ["Files", "text/uri-list", "text/plain"];

function carriesDroppableContent(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) return false;
  return ACCEPTED_TRANSFER_TYPES.some((type) =>
    dataTransfer.types.includes(type),
  );
}

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  );
}

/**
 * Glisser-déposer sur toute la fenêtre : un fichier, un lien ou du texte lâché
 * crée le node correspondant à l'endroit du curseur.
 *
 * Le pendant du coller (`useCanvasPasteHandler`) : même fabrique de nodes, mais
 * positionnée au point de drop au lieu du centre du viewport. Les listeners sont
 * posés sur `window` — donc valables aussi au-dessus de la sidebar et des
 * panneaux — et s'effacent devant toute drop zone imbriquée qui a déjà traité
 * l'événement (import CSV, éditeur BlockNote ouvert en fenêtre…).
 *
 * Doit être appelé à l'intérieur d'un `ReactFlowProvider`.
 */
export function useCanvasDropHandler({ canEdit }: { canEdit: boolean }) {
  const { screenToFlowPosition } = useReactFlow();
  const { x: canvasX, y: canvasY, zoom: canvasZoom } = useViewport();
  const { createNodesFromFiles, createNodeFromText } = useCanvasContentIngest();
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  // `dragenter`/`dragleave` se déclenchent à chaque passage de frontière entre
  // éléments enfants : on compte les entrées pour ne masquer l'overlay qu'en
  // sortant réellement de la fenêtre.
  const dragDepthRef = useRef(0);

  /**
   * Le point de drop en coordonnées canvas. Hors du conteneur React Flow
   * (sidebar, panneaux flottants), `screenToFlowPosition` renverrait un point
   * hors écran : on retombe alors sur le centre du viewport.
   */
  const getDropPosition = useCallback(
    (clientX: number, clientY: number): XYPosition => {
      const pane = document.querySelector(".react-flow");
      if (pane) {
        const rect = pane.getBoundingClientRect();
        const isInsidePane =
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom;
        if (isInsidePane) {
          return screenToFlowPosition({ x: clientX, y: clientY });
        }
      }

      return {
        x: (window.innerWidth / 2 - canvasX) / canvasZoom,
        y: (window.innerHeight / 2 - canvasY) / canvasZoom,
      };
    },
    [screenToFlowPosition, canvasX, canvasY, canvasZoom],
  );

  const shouldHandle = useCallback(
    (event: DragEvent): boolean => {
      if (!canEdit) return false;
      // Une drop zone imbriquée a déjà pris l'événement. Les listeners natifs
      // sur `window` tournent après les handlers React, le drapeau est fiable.
      if (event.defaultPrevented) return false;
      if (isEditableTarget(event.target)) return false;
      return carriesDroppableContent(event.dataTransfer);
    },
    [canEdit],
  );

  const resetDragState = useCallback(() => {
    dragDepthRef.current = 0;
    setIsDraggingOver(false);
  }, []);

  useEffect(() => {
    const onDragEnter = (event: DragEvent) => {
      if (!shouldHandle(event)) return;
      dragDepthRef.current += 1;
      setIsDraggingOver(true);
    };

    const onDragLeave = (event: DragEvent) => {
      if (!carriesDroppableContent(event.dataTransfer)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setIsDraggingOver(false);
      }
    };

    const onDragOver = (event: DragEvent) => {
      if (!shouldHandle(event)) return;
      // Sans ce preventDefault, `drop` ne se déclenche jamais et le navigateur
      // ouvre le fichier à la place du canvas.
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "copy";
      }
    };

    const onDrop = (event: DragEvent) => {
      if (!shouldHandle(event)) {
        resetDragState();
        return;
      }

      event.preventDefault();
      resetDragState();

      const position = getDropPosition(event.clientX, event.clientY);
      const files = Array.from(event.dataTransfer?.files ?? []);

      if (files.length > 0) {
        void createNodesFromFiles(files, position);
        return;
      }

      const text =
        event.dataTransfer?.getData("text/uri-list") ||
        event.dataTransfer?.getData("text/plain") ||
        "";
      if (text.trim()) {
        // Une liste d'URI peut contenir plusieurs lignes et des commentaires
        // (`#`) : on ne garde que la première URL utile.
        const firstLine =
          text
            .split(/\r?\n/)
            .map((line) => line.trim())
            .find((line) => line && !line.startsWith("#")) ?? text;
        void createNodeFromText(firstLine, position);
      }
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", resetDragState);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", resetDragState);
    };
  }, [
    shouldHandle,
    resetDragState,
    getDropPosition,
    createNodesFromFiles,
    createNodeFromText,
  ]);

  return { isDraggingOver };
}
