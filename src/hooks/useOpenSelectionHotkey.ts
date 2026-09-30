import { useHotkey } from "@tanstack/react-hotkeys";
import { useReactFlow } from "@xyflow/react";
import toast from "react-hot-toast";
import { useCanvasOwnsKeyboard } from "./useCanvasHotkeysEnabled";
import { isEditableTarget } from "@/lib/editableTarget";
import { useNodeEditorStore } from "@/stores/nodeEditorStore";
import {
  MAX_TILED_WINDOWS,
  canOpenWindow,
  useWindowsStore,
} from "@/stores/windowsStore";
import type { Id } from "@/../convex/_generated/dataModel";
import type { NodeType } from "@/types/domain";

/**
 * Les types qui passent en édition sur signal (cf. `nodeEditorStore`). Pas la
 * frame : son `InlineEditableText` n'honore `startInEditMode` qu'une fois par
 * montage, un second Entrée resterait muet.
 */
const EDITABLE_ON_ENTER = new Set<string>(["title"]);

/**
 * Entrée garde son rôle natif sur un élément interactif (bouton de la
 * toolbar, item de menu…) : on n'agit que depuis le canvas lui-même — le
 * `body` après un clic sur le fond, ou un node focalisé.
 */
function isCanvasTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target === document.body || target === document.documentElement) {
    return true;
  }
  return (
    !!target.closest(".react-flow") &&
    !target.closest('button, a, [role="button"], [role="menuitem"]')
  );
}

type Candidate = {
  xyNodeId: string;
  nodeDataId: Id<"nodeDatas">;
  nodeType: NodeType;
  x: number;
  y: number;
};

/**
 * L'ordre des cases suit le canvas : ce qui est à gauche s'ouvre à gauche.
 * En 2×2, les deux nodes les plus hauts forment la rangée du haut.
 */
function arrangeForTiles(candidates: Candidate[]): Candidate[] {
  const byX = (a: Candidate, b: Candidate) => a.x - b.x;
  const readingOrder = [...candidates]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .slice(0, MAX_TILED_WINDOWS);
  if (readingOrder.length < 4) return readingOrder.sort(byX);
  return [
    ...readingOrder.slice(0, 2).sort(byX),
    ...readingOrder.slice(2).sort(byX),
  ];
}

/**
 * Entrée sur la sélection du canvas :
 *
 * - un node ouvrable → sa window ;
 * - un titre → passage en édition (pour un éditeur) ;
 * - plusieurs nodes → leurs windows en grille (cf. `openWindowsTiled`), les
 *   autres windows réduites dans le dock.
 *
 * Pas de garde « frappe isolée » ici, contrairement aux lettres : un texte
 * tapé dans le vide se remarque avant d'appuyer sur Entrée.
 */
export function useOpenSelectionHotkey({
  canEdit,
  isTouch,
}: {
  canEdit: boolean;
  isTouch: boolean;
}) {
  const { getNodes, getInternalNode } = useReactFlow();
  const canvasOwnsKeyboard = useCanvasOwnsKeyboard();

  useHotkey(
    "Enter",
    (event) => {
      if (event.repeat || isEditableTarget(event.target)) return;
      if (!isCanvasTarget(event.target)) return;

      const nodes = getNodes();
      // Entrée sur un node focalisé mais NON sélectionné : React Flow le
      // sélectionne à la place du reste (a11y clavier de `NodeWrapper`). On
      // le laisse faire plutôt que d'ouvrir une sélection qui va changer.
      const focusedNodeId = (event.target as HTMLElement)
        .closest(".react-flow__node")
        ?.getAttribute("data-id");
      if (
        focusedNodeId &&
        !nodes.some((node) => node.id === focusedNodeId && node.selected)
      ) {
        return;
      }

      const selected = nodes.filter((node) => node.selected);
      if (selected.length === 0) return;

      const candidates: Candidate[] = [];
      for (const node of selected) {
        const nodeDataId = node.data?.nodeDataId as
          | Id<"nodeDatas">
          | undefined;
        const nodeType = node.type as NodeType | undefined;
        if (!nodeDataId || !nodeType) continue;
        if (!canOpenWindow(nodeType, nodeDataId)) continue;
        // Position absolue : un node dans une frame a une position relative.
        const internal = getInternalNode(node.id);
        const origin = internal?.internals.positionAbsolute ?? node.position;
        candidates.push({
          xyNodeId: node.id,
          nodeDataId,
          nodeType,
          x: origin.x + (node.measured?.width ?? node.width ?? 0) / 2,
          y: origin.y + (node.measured?.height ?? node.height ?? 0) / 2,
        });
      }

      if (candidates.length === 0) {
        const [only] = selected;
        if (
          selected.length === 1 &&
          canEdit &&
          only.type &&
          EDITABLE_ON_ENTER.has(only.type)
        ) {
          event.preventDefault();
          useNodeEditorStore.getState().setEditingNodeId(only.id);
        }
        return;
      }

      event.preventDefault();
      const { openWindow, openWindowsTiled } = useWindowsStore.getState();

      if (candidates.length === 1) {
        const [{ xyNodeId, nodeDataId, nodeType }] = candidates;
        openWindow({ xyNodeId, nodeDataId, nodeType });
        return;
      }

      openWindowsTiled(
        arrangeForTiles(candidates).map(
          ({ xyNodeId, nodeDataId, nodeType }) => ({
            xyNodeId,
            nodeDataId,
            nodeType,
          }),
        ),
      );
      if (candidates.length > MAX_TILED_WINDOWS) {
        toast(
          `Opened the first ${MAX_TILED_WINDOWS} of ${candidates.length} nodes`,
        );
      }
    },
    // `preventDefault` manuel : Entrée doit rester intact sur un bouton ou
    // un item de menu, que `ignoreInputs` ne couvre pas.
    {
      enabled: canvasOwnsKeyboard && !isTouch,
      ignoreInputs: true,
      preventDefault: false,
      stopPropagation: false,
    },
  );
}
