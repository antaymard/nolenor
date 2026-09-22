import { useCallback, useEffect, useMemo } from "react";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import type { BookmarkTarget } from "@/../convex/schemas/canvasBookmarksSchema";
import { getNodeDataTitle } from "@/../convex/lib/getNodeDataTitle";
import { useBookmarkedNodesStore } from "@/stores/bookmarkedNodesStore";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useTemplatesStore } from "@/stores/templatesStore";

export type CanvasBookmark = Doc<"canvasBookmarks">;

/** Un repère prêt à afficher : libellé résolu, cible vérifiée. */
export type ResolvedBookmark = CanvasBookmark & {
  /** Le nom choisi, ou à défaut le titre vivant du node visé. */
  displayLabel: string;
  /**
   * La cible n'existe plus sur le canvas. Le repère reste affiché — le node
   * peut être à la corbeille, donc restaurable — mais grisé et inerte.
   */
  isDangling: boolean;
  /** Pour une `selection`, le nombre de nodes encore vivants. */
  liveNodeCount: number;
  /**
   * Type du node visé (kind === "node" uniquement), pour brancher son icône
   * dans le panneau. Absent si le node a disparu.
   */
  nodeType?: string;
  /** Nom d'icône du template (custom nodes uniquement). */
  templateIconName?: string | null;
};

const FRAMING_FALLBACK_LABEL = "Position";
const MISSING_NODE_LABEL = "Deleted node";

/**
 * Les repères de l'utilisateur sur ce canvas, résolus pour l'affichage.
 *
 * La résolution passe par `api.nodes.listFromCanvas` et non par les nodes
 * React Flow : c'est la même query que celle déjà souscrite par
 * `useCanvasBootstrap` (donc rien de plus sur le réseau, le client Convex
 * partage la souscription), et surtout elle est lisible **hors** du
 * `ReactFlowProvider` — ce dont le command palette, monté à la racine, a
 * besoin. La navigation, elle, reste dans `useGoToBookmark`, sous le provider.
 *
 * `enabled: false` évite de faire tourner les queries tant que la surface
 * appelante est fermée (panneau replié, modale du command palette fermée).
 */
export function useCanvasBookmarks({
  canvasId,
  enabled = true,
}: {
  canvasId: Id<"canvases"> | undefined;
  enabled?: boolean;
}) {
  // `listForCanvas` commence par `requireAuth` : interrogée sans session, elle
  // lève, et un `useQuery` qui lève le fait PENDANT le render — toute la route
  // canvas tomberait sur l'errorComponent du routeur. Or un canvas public se
  // visite sans compte (cf. `AuthUpgradeBanner`). Pas de session, pas de
  // repères : il n'y a de toute façon aucun utilisateur à qui les rattacher.
  const { isAuthenticated } = useConvexAuth();
  const shouldQuery = enabled && isAuthenticated && canvasId !== undefined;

  const bookmarks = useQuery(
    api.canvasBookmarks.listForCanvas,
    shouldQuery ? { canvasId } : "skip",
  );
  const nodes = useQuery(
    api.nodes.listFromCanvas,
    shouldQuery ? { canvasId } : "skip",
  );

  const createBookmark = useMutation(api.canvasBookmarks.create);
  const renameBookmark = useMutation(api.canvasBookmarks.rename);
  const reorderBookmarks = useMutation(api.canvasBookmarks.reorder);
  const removeBookmark = useMutation(api.canvasBookmarks.remove);

  // La résolution d'un llmid : llmid → nodeDataId → doc, avec le `type` du doc
  // `nodes` en repli quand le nodeData n'est pas (encore) en store — l'icône
  // reste branchée même pendant le chargement des contenus. Les stores sont
  // lus en entier parce que le titre d'un node bookmarké doit suivre ses
  // éditions en direct — c'est tout l'intérêt de ne pas figer le libellé
  // (cf. `label` dans le schéma).
  const nodeDatas = useNodeDataStore((state) => state.nodeDatas);
  const templates = useTemplatesStore((state) => state.templates);

  const nodeMetaByNodeId = useMemo(() => {
    const map = new Map<string, { nodeDataId: Id<"nodeDatas">; type: string }>();
    for (const node of nodes ?? []) {
      map.set(node.id, { nodeDataId: node.nodeDataId, type: node.type });
    }
    return map;
  }, [nodes]);

  /**
   * Tout ce qu'un repère `node` veut savoir de sa cible, en une seule chaîne
   * de lookups : le titre vivant (dont l'absence dit que la cible est morte),
   * le type pour l'icône, et l'icône de template pour les custom nodes.
   */
  const resolveNodeMeta = useCallback(
    (
      nodeId: string,
    ): {
      title: string | undefined;
      nodeType: string | undefined;
      templateIconName: string | null | undefined;
    } => {
      const meta = nodeMetaByNodeId.get(nodeId);
      const nodeData = meta ? nodeDatas.get(meta.nodeDataId) : undefined;
      const nodeType = nodeData?.type ?? meta?.type;
      const template = nodeData?.templateId
        ? templates.get(nodeData.templateId)
        : undefined;
      return {
        title: nodeData
          ? getNodeDataTitle(nodeData, template ?? null)
          : undefined,
        nodeType,
        templateIconName:
          nodeType === "custom" ? (template?.icon ?? null) : undefined,
      };
    },
    [nodeMetaByNodeId, nodeDatas, templates],
  );

  const resolved = useMemo<Array<ResolvedBookmark> | undefined>(() => {
    if (bookmarks === undefined) return undefined;
    // Les nodes ne sont pas encore là : on ne peut ni titrer ni juger de la
    // survie des cibles. Tout annoncer « supprimé » le temps du chargement
    // ferait clignoter la liste en gris.
    if (nodes === undefined) return undefined;

    return bookmarks.map((bookmark) => {
      const { target } = bookmark;

      if (target.kind === "framing") {
        return {
          ...bookmark,
          displayLabel: bookmark.label ?? FRAMING_FALLBACK_LABEL,
          isDangling: false,
          liveNodeCount: 0,
        };
      }

      if (target.kind === "node") {
        const { title, nodeType, templateIconName } = resolveNodeMeta(
          target.nodeId,
        );
        return {
          ...bookmark,
          displayLabel: bookmark.label ?? title ?? MISSING_NODE_LABEL,
          isDangling: title === undefined,
          liveNodeCount: title === undefined ? 0 : 1,
          nodeType,
          templateIconName,
        };
      }

      const liveNodeCount = target.nodeIds.filter((nodeId) =>
        nodeMetaByNodeId.has(nodeId),
      ).length;
      return {
        ...bookmark,
        // Le compte vivant et pas celui d'origine : un repère qui annonce
        // « 5 nodes » et en cadre 3 ment sur ce qu'il va faire.
        displayLabel: bookmark.label ?? `${liveNodeCount} nodes`,
        isDangling: liveNodeCount === 0,
        liveNodeCount,
      };
    });
  }, [bookmarks, nodes, nodeMetaByNodeId, resolveNodeMeta]);

  // Même garde côté écriture, et exposée aux appelants : les menus contextuels
  // s'ouvrent aussi pour un visiteur anonyme, qui ne doit pas se voir proposer
  // une action que le serveur refusera.
  const canBookmark = isAuthenticated && canvasId !== undefined;

  const create = useCallback(
    (target: BookmarkTarget, label?: string) => {
      if (!canvasId || !isAuthenticated) return;
      return createBookmark({ canvasId, target, label });
    },
    [canvasId, isAuthenticated, createBookmark],
  );

  return {
    bookmarks: resolved,
    isLoading: shouldQuery && resolved === undefined,
    canBookmark,
    create,
    rename: renameBookmark,
    reorder: reorderBookmarks,
    remove: removeBookmark,
  };
}

/**
 * Tient à jour le set des nodes bookmarkés, pour la pastille de `NodeFrame`.
 *
 * Appelé une seule fois, par `CanvasFlow`. C'est la seule souscription aux
 * repères qui reste ouverte en permanence sur un canvas — le panneau de la
 * toolbar et le command palette, eux, ne s'abonnent que lorsqu'ils sont
 * ouverts. Elle se paie sur une table minuscule (les repères d'UN utilisateur
 * sur UN canvas) et c'est ce qui permet à la pastille d'apparaître à l'instant
 * où l'on pose le repère.
 *
 * Les repères `framing` ne visent aucun node : ils ne peignent rien.
 */
export function useSyncBookmarkedNodes(
  canvasId: Id<"canvases"> | undefined,
): void {
  // Même garde que `useCanvasBookmarks` : ce hook tourne pour TOUT canvas
  // ouvert, visiteur anonyme d'un canvas public compris.
  const { isAuthenticated } = useConvexAuth();
  const bookmarks = useQuery(
    api.canvasBookmarks.listForCanvas,
    canvasId && isAuthenticated ? { canvasId } : "skip",
  );
  const setNodeIds = useBookmarkedNodesStore((state) => state.setNodeIds);

  useEffect(() => {
    const nodeIds = new Set<string>();
    for (const bookmark of bookmarks ?? []) {
      const { target } = bookmark;
      if (target.kind === "node") nodeIds.add(target.nodeId);
      if (target.kind === "selection") {
        for (const nodeId of target.nodeIds) nodeIds.add(nodeId);
      }
    }
    setNodeIds(nodeIds);
  }, [bookmarks, setNodeIds]);

  // Le canvas change : on vide, sans attendre que la nouvelle query réponde.
  // Sinon les nodes du canvas suivant héritent une frame des pastilles du
  // précédent — les llmid ne sont uniques que par canvas.
  useEffect(() => {
    return () => setNodeIds(new Set());
  }, [canvasId, setNodeIds]);
}
