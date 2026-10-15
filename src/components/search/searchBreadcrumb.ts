import { createContext, useContext, useMemo } from "react";
import {
  useStore,
  type Edge,
  type Node,
  type ReactFlowState,
} from "@xyflow/react";
import { shallow } from "zustand/shallow";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { absolutePosition } from "@/../convex/lib/nodeGeometry";
import { getNodeDataTitle } from "@/components/utils/nodeDataDisplayUtils";
import { useNodeDataStore } from "@/stores/nodeDataStore";

/**
 * Le fil d'Ariane d'un résultat de recherche : les titres et frames sous
 * lesquels il se range, du plus large au plus précis — « Frame › H1 › H2 »,
 * ou « H1 › H2 › Frame » quand ce sont les titres qui rangent la frame.
 *
 * Les titres se rattachent comme dans la minimap de l'agent
 * (`generateCanvasMinimap`) : une edge titre → node d'abord, sinon le titre le
 * plus proche juste au-dessus. Ici, on remonte en plus d'un titre à l'autre
 * (edge titre → titre, ou titre de niveau supérieur au-dessus) pour obtenir
 * toute la chaîne, pas seulement le premier parent.
 */

export type BreadcrumbCrumb = {
  nodeId: string;
  kind: "frame" | "title";
  label: string;
};

// Mêmes seuils que la minimap : un titre « possède » ce qui est juste sous lui.
const VERTICAL_THRESHOLD = 300;
const HORIZONTAL_MARGIN = 100;
const MAX_DEPTH = 6;

const LEVEL_RANK: Record<string, number> = { h1: 3, h2: 2, h3: 1, p: 0 };

type Rect = { x: number; y: number; width: number; height: number };

type TitleEntry = {
  node: Node;
  rect: Rect;
  rank: number;
};

type BreadcrumbIndex = {
  byId: Map<string, Node>;
  rects: Map<string, Rect>;
  titles: TitleEntry[];
  /** Pour chaque node, les titres qui pointent vers lui par une edge. */
  titleSources: Map<string, string[]>;
  nodeDatas: Map<Id<"nodeDatas">, Doc<"nodeDatas">>;
};

function nodeDataOf(index: BreadcrumbIndex, node: Node) {
  const nodeDataId = (node.data as { nodeDataId?: Id<"nodeDatas"> })
    ?.nodeDataId;
  return nodeDataId ? index.nodeDatas.get(nodeDataId) : undefined;
}

function rankOf(nodeData: Doc<"nodeDatas"> | undefined): number {
  const level = nodeData?.values?.level;
  return typeof level === "string" ? (LEVEL_RANK[level] ?? 0) : 0;
}

export function buildIndex(
  nodes: Node[],
  edges: Edge[],
  nodeDatas: Map<Id<"nodeDatas">, Doc<"nodeDatas">>,
): BreadcrumbIndex {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const rects = new Map<string, Rect>();
  for (const node of nodes) {
    const position = absolutePosition(node, byId);
    rects.set(node.id, {
      ...position,
      width: node.measured?.width ?? node.width ?? 0,
      height: node.measured?.height ?? node.height ?? 0,
    });
  }

  const index: BreadcrumbIndex = {
    byId,
    rects,
    titles: [],
    titleSources: new Map(),
    nodeDatas,
  };

  for (const node of nodes) {
    if (node.type !== "title" || node.hidden) continue;
    index.titles.push({
      node,
      rect: rects.get(node.id)!,
      rank: rankOf(nodeDataOf(index, node)),
    });
  }

  for (const edge of edges) {
    if (byId.get(edge.source)?.type !== "title") continue;
    const sources = index.titleSources.get(edge.target);
    if (sources) sources.push(edge.source);
    else index.titleSources.set(edge.target, [edge.source]);
  }

  return index;
}

/** Le titre le plus proche au-dessus du node, dans la même frame que lui. */
function findTitleAbove(
  index: BreadcrumbIndex,
  node: Node,
  minRank: number,
): Node | null {
  const rect = index.rects.get(node.id);
  if (!rect) return null;

  let best: Node | null = null;
  let bestGap = Infinity;
  for (const title of index.titles) {
    if (title.node.id === node.id) continue;
    if (title.rank < minRank) continue;
    // Un titre hors de la frame du node ne le range pas.
    if ((title.node.parentId ?? null) !== (node.parentId ?? null)) continue;
    const gap = rect.y - (title.rect.y + title.rect.height);
    if (gap < 0 || gap > VERTICAL_THRESHOLD) continue;
    const left = title.rect.x - HORIZONTAL_MARGIN;
    const right = title.rect.x + title.rect.width + HORIZONTAL_MARGIN;
    if (rect.x > right || rect.x + rect.width < left) continue;
    if (gap < bestGap) {
      bestGap = gap;
      best = title.node;
    }
  }
  return best;
}

function scopeOf(node: Node): string | null {
  return node.parentId ?? null;
}

/**
 * Le titre qui range le node dans sa propre frame. Un titre relié par une
 * edge mais posé hors de la frame du node est renvoyé à part (`outer`) : il
 * range la frame entière, pas le node à l'intérieur.
 */
function findParentTitle(
  index: BreadcrumbIndex,
  node: Node,
): { inner: Node | null; outer: Node | null } {
  let outer: Node | null = null;
  for (const sourceId of index.titleSources.get(node.id) ?? []) {
    const source = index.byId.get(sourceId);
    if (!source) continue;
    if (scopeOf(source) === scopeOf(node)) return { inner: source, outer };
    outer ??= source;
  }
  // Entre titres, seul un niveau supérieur fait un parent : deux H2 empilés
  // sont frères, pas parent et enfant.
  const minRank =
    node.type === "title" ? rankOf(nodeDataOf(index, node)) + 1 : 0;
  return { inner: findTitleAbove(index, node, minRank), outer };
}

function labelOf(index: BreadcrumbIndex, node: Node): string {
  const nodeData = nodeDataOf(index, node);
  return nodeData ? getNodeDataTitle(nodeData).trim() : "";
}

/**
 * Remonte du node vers la racine : les titres de sa frame, puis la frame,
 * puis les titres qui rangent la frame, et ainsi de suite. Le résultat se lit
 * du plus large au plus précis.
 */
export function computeBreadcrumb(
  index: BreadcrumbIndex,
  nodeId: string,
): BreadcrumbCrumb[] {
  const node = index.byId.get(nodeId);
  if (!node) return [];

  const crumbs: BreadcrumbCrumb[] = [];
  const seen = new Set([node.id]);
  // Titre hors frame relié à un node de la frame : il range la frame.
  let outerCandidate: Node | null = null;
  let current: Node = node;

  while (crumbs.length < MAX_DEPTH) {
    const { inner, outer } = findParentTitle(index, current);
    if (outer && !outerCandidate) outerCandidate = outer;
    let next = inner;
    if (
      !next &&
      outerCandidate &&
      scopeOf(outerCandidate) === scopeOf(current)
    ) {
      next = outerCandidate;
      outerCandidate = null;
    }

    if (next) {
      if (seen.has(next.id)) break;
      seen.add(next.id);
      const label = labelOf(index, next);
      if (label) crumbs.push({ nodeId: next.id, kind: "title", label });
      current = next;
      continue;
    }

    const frame = current.parentId
      ? index.byId.get(current.parentId)
      : undefined;
    if (frame?.type !== "frame" || seen.has(frame.id)) break;
    seen.add(frame.id);
    crumbs.push({
      nodeId: frame.id,
      kind: "frame",
      label: labelOf(index, frame) || "Frame",
    });
    current = frame;
  }

  return crumbs.reverse();
}

const selectGraph = (state: ReactFlowState) => ({
  nodes: state.nodes,
  edges: state.edges,
});

type Resolver = (nodeId: string) => BreadcrumbCrumb[];

const NO_BREADCRUMB: BreadcrumbCrumb[] = [];
export const BreadcrumbContext = createContext<Resolver>(() => NO_BREADCRUMB);

/** Le résolveur `nodeId → fil d'Ariane`, à fournir via `BreadcrumbContext`. */
export function useBreadcrumbResolver(): Resolver {
  const { nodes, edges } = useStore(selectGraph, shallow);
  const nodeDatas = useNodeDataStore((state) => state.nodeDatas);

  return useMemo<Resolver>(() => {
    const index = buildIndex(nodes, edges, nodeDatas);
    const cache = new Map<string, BreadcrumbCrumb[]>();
    return (nodeId) => {
      const cached = cache.get(nodeId);
      if (cached) return cached;
      const crumbs = computeBreadcrumb(index, nodeId);
      cache.set(nodeId, crumbs);
      return crumbs;
    };
  }, [nodes, edges, nodeDatas]);
}

/** Le fil d'Ariane d'un node (vide hors d'un `SearchBreadcrumbsProvider`). */
export function useSearchBreadcrumb(nodeId: string): BreadcrumbCrumb[] {
  return useContext(BreadcrumbContext)(nodeId);
}
