import { useCallback } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import { useUpdateCanvasNode } from "@/hooks/useUpdateCanvasNode";
import { useCreateEdge } from "@/hooks/useCreateEdge";
import { withUndoTransaction } from "@/stores/canvasHistoryStore";
import { placeBesideFrame } from "@/lib/frameMembership";
import { FRAME_FIT_PADDING } from "@/lib/frameFit";

function sizeOf(node: Node) {
  return {
    width: node.measured?.width ?? node.width ?? 0,
    height: node.measured?.height ?? node.height ?? 0,
  };
}

/**
 * Sortir des nodes de leur frame : ils se posent juste à côté d'elle sur le
 * canvas (cf. `placeBesideFrame`), et une edge frame → node garde la trace
 * d'où ils viennent.
 *
 * Pensé d'abord pour la window d'une frame compacte, dont le contenu est
 * masqué sur le canvas : sorti, le node réapparaît à côté de la carte, relié
 * à elle. Vaut aussi pour une frame dépliée.
 *
 * Un seul Ctrl+Z pour le tout — les positions, l'appartenance et les edges.
 *
 * Doit être appelé sous le provider React Flow DU CANVAS : la window d'une
 * frame passe ses menus contextuels au canvas, avec ses nodes à lui.
 */
export function useRemoveFromFrame() {
  const { getNodes, getEdges } = useReactFlow();
  const { updateCanvasNodes } = useUpdateCanvasNode();
  const { createEdge } = useCreateEdge();

  const removeFromFrame = useCallback(
    (nodeIds: string[]) => {
      const nodes = getNodes();
      const byId = new Map(nodes.map((node) => [node.id, node]));

      // Par frame : une sélection peut mêler les enfants de plusieurs.
      const byFrame = new Map<string, Node[]>();
      for (const id of nodeIds) {
        const node = byId.get(id);
        if (!node?.parentId) continue;
        const group = byFrame.get(node.parentId);
        if (group) group.push(node);
        else byFrame.set(node.parentId, [node]);
      }
      if (byFrame.size === 0) return;

      const edges = getEdges();
      const isLinked = (a: string, b: string) =>
        edges.some(
          (edge) =>
            (edge.source === a && edge.target === b) ||
            (edge.source === b && edge.target === a),
        );

      const updates: Parameters<typeof updateCanvasNodes>[0] = [];
      const links: Array<{ source: string; target: string }> = [];
      for (const [frameId, members] of byFrame) {
        const frame = byId.get(frameId);
        if (!frame) continue;
        // Les frames sont toujours de premier niveau : leur `position` est en
        // coordonnées monde. Sa largeur est celle RENDUE — la carte pour une
        // compacte.
        const positions = placeBesideFrame(
          { ...frame.position, width: sizeOf(frame).width },
          members.map((node) => ({
            id: node.id,
            ...node.position,
            ...sizeOf(node),
          })),
          FRAME_FIT_PADDING,
        );
        for (const node of members) {
          const position = positions.get(node.id);
          if (!position) continue;
          updates.push({
            nodeId: node.id,
            props: { parentId: null, position },
          });
          if (!isLinked(frameId, node.id)) {
            links.push({ source: frameId, target: node.id });
          }
        }
      }
      if (updates.length === 0) return;

      void withUndoTransaction("Remove from frame", async () => {
        await updateCanvasNodes(updates);
        // Après le patch : `createEdge` enregistre son annulation à la
        // confirmation serveur, qui doit tomber dans cette transaction.
        await Promise.allSettled(links.map((link) => createEdge(link).settled));
      });
    },
    [createEdge, getEdges, getNodes, updateCanvasNodes],
  );

  return { removeFromFrame };
}
