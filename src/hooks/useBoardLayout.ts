import { useCallback, useLayoutEffect, useMemo, type RefObject } from "react";
import { useReactFlow, useStore, type ReactFlowState } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import {
  groupBoardChildren,
  type BoardLayout,
} from "@/../convex/config/boardConfig";
import type { NodePlacement } from "@/../convex/schemas/nodesSchema";
import { applyNodePatchesToListQuery } from "@/lib/flowNodes";
import { trackCanvasSync } from "@/lib/trackCanvasSync";
import { GHOST_ATTR, offsetWithin } from "@/lib/boardDom";
import { useCanvasStore } from "@/stores/canvasStore";
import { useBoardDropStore } from "@/stores/boardDropStore";

/**
 * Un enfant de board, tel que ses espaces le rangent : sa hauteur suffit, sa
 * largeur est celle de l'espace (il s'étire) et sa position s'en déduit.
 */
export type BoardChild = { id: string; height: number };

/**
 * Les enfants du board, espace par espace, dans l'ordre de leur clé.
 *
 * Le sélecteur rend une chaîne, comparée par valeur : le board ne re-rend que
 * si un enfant arrive, part, change d'espace, d'ordre ou de hauteur — pas à
 * chaque pixel d'un drag ailleurs sur le canvas, ni quand il déplace
 * lui-même ses enfants.
 */
export function useBoardChildren(
  boardId: string,
  layout: BoardLayout | null,
): Map<string, BoardChild[]> {
  const key = useStore((state: ReactFlowState) =>
    state.nodes
      .flatMap((node) => {
        if (node.parentId !== boardId) return [];
        const placement = node.data?.placement as NodePlacement | undefined;
        const height = node.measured?.height ?? node.height ?? 0;
        return [
          [node.id, height, placement?.spaceId ?? "", placement?.order ?? ""]
            .map(String)
            .join("\u0001"),
        ];
      })
      .join("\u0002"),
  );

  return useMemo(() => {
    if (!layout) return new Map();
    const children = (key ? key.split("\u0002") : []).map((entry) => {
      const [id, height, spaceId, order] = entry.split("\u0001");
      return {
        id,
        height: Number(height),
        ...(spaceId && { placement: { spaceId, order } }),
      };
    });
    return groupBoardChildren(layout, children);
  }, [layout, key]);
}

/** Au-dessous, un écart de position ou de taille ne vaut pas une écriture. */
const EPSILON = 0.5;

/**
 * Pose les enfants du board là où ses espaces les rangent, et le board à la
 * taille de son contenu.
 *
 * La mise en page est celle du DOM : chaque espace contient une boîte
 * fantôme par enfant, à sa hauteur, étirée à sa largeur. On lit où elles
 * sont tombées, et on y écrit les vrais nodes. Rien n'est réimplémenté — une
 * vraie flexbox.
 *
 * Écrit seulement ce qui a changé. Chaque éditeur qui regarde le board mesure
 * la même chose : les écritures convergent, sans coordination. Pas d'entrée
 * d'historique — c'est une conséquence d'un geste (dépôt, changement
 * d'arbre), que l'historique couvre déjà par le rangement (`placement`).
 *
 * Gelée pendant un drag qui vise le board ou porte un de ses enfants : la
 * ligne d'insertion décale les fantômes, et le node porté suit le curseur.
 */
export function useBoardLayout({
  boardId,
  contentRef,
  revision,
}: {
  boardId: string;
  contentRef: RefObject<HTMLDivElement | null>;
  /** Change quand l'arbre ou les enfants changent : relance la mesure. */
  revision: unknown;
}) {
  const { getNodes } = useReactFlow();
  const canEdit = useCanvasStore(
    (state) => state.canvas?._permission !== "viewer",
  );
  const canvasId = useCanvasStore((state) => state.canvas?._id);
  const patchNodes = useMutation(api.nodes.patch);
  const patchNodesOptimistic = useMemo(
    () =>
      patchNodes.withOptimisticUpdate((localStore, { updates }) => {
        if (canvasId)
          applyNodePatchesToListQuery(localStore, canvasId, updates);
      }),
    [patchNodes, canvasId],
  );

  const measure = useCallback(() => {
    const root = contentRef.current;
    if (!canEdit || !root) return;
    if (useBoardDropStore.getState().target?.boardId === boardId) return;

    const nodes = getNodes();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const board = byId.get(boardId);
    if (!board) return;
    if (nodes.some((node) => node.parentId === boardId && node.dragging)) {
      return;
    }

    // Le contenu est posé dans le cadre du board, sous sa bordure : les
    // positions des enfants et la taille du board sont celles du NODE, qui
    // commence au bord extérieur.
    const frame = root.offsetParent as HTMLElement | null;
    const inset = {
      x: root.offsetLeft + (frame?.clientLeft ?? 0),
      y: root.offsetTop + (frame?.clientTop ?? 0),
    };

    const updates: Array<{
      nodeId: string;
      props: {
        position?: { x: number; y: number };
        width?: number;
        height?: number;
      };
    }> = [];

    for (const ghost of root.querySelectorAll<HTMLElement>(`[${GHOST_ATTR}]`)) {
      const node = byId.get(ghost.getAttribute(GHOST_ATTR) ?? "");
      if (!node) continue;
      const offset = offsetWithin(ghost, root);
      const position = { x: offset.x + inset.x, y: offset.y + inset.y };
      const width = ghost.offsetWidth;
      const nodeWidth = node.width ?? node.measured?.width ?? 0;
      if (
        Math.abs(position.x - node.position.x) >= EPSILON ||
        Math.abs(position.y - node.position.y) >= EPSILON ||
        Math.abs(width - nodeWidth) >= EPSILON
      ) {
        updates.push({ nodeId: node.id, props: { position, width } });
      }
    }

    const size = {
      width: root.offsetWidth + 2 * inset.x,
      height: root.offsetHeight + 2 * inset.y,
    };
    if (
      Math.abs(size.width - (board.width ?? 0)) >= EPSILON ||
      Math.abs(size.height - (board.height ?? 0)) >= EPSILON
    ) {
      updates.push({ nodeId: boardId, props: size });
    }

    if (updates.length === 0) return;
    void trackCanvasSync(() => patchNodesOptimistic({ updates })).catch(
      () => undefined,
    );
  }, [boardId, canEdit, contentRef, getNodes, patchNodesOptimistic]);

  // Après chaque rendu qui change l'arbre ou les enfants…
  useLayoutEffect(measure, [measure, revision]);

  // …et quand le contenu change de taille sans eux : une police qui arrive,
  // un enfant qui grandit.
  useLayoutEffect(() => {
    const root = contentRef.current;
    if (!root) return;
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    });
    observer.observe(root);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [contentRef, measure]);

  // Le drag qui visait le board vient de finir : on range.
  useLayoutEffect(
    () =>
      useBoardDropStore.subscribe((state, previous) => {
        if (
          previous.target?.boardId === boardId &&
          state.target?.boardId !== boardId
        ) {
          requestAnimationFrame(measure);
        }
      }),
    [boardId, measure],
  );
}
