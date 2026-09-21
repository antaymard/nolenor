import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalQuery } from "../../_generated/server";
import type { QueryCtx } from "../../_generated/server";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import { isNodeTypeReadableByAgent } from "../../config/nodeConfig";
import * as EdgeModels from "../../models/edgeModels";
import * as NodeModels from "../../models/nodeModels";

// ---- Types ----

type RawCanvasNode = {
  id: string;
  type: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  nodeDataId?: Id<"nodeDatas">;
  /** La frame qui contient ce node, s'il y en a une. */
  parentId?: string;
};

type RawCanvasEdge = {
  source: string;
  target: string;
};

type TitleData = {
  id: string;
  text: string;
  level: "h1" | "h2" | "h3" | "p";
  position: { x: number; y: number };
  width: number;
  height: number;
};

type LeafElement = {
  id: string;
  type: string;
  title: string | null;
  infoWeight: number;
};

type Hub = {
  rank: 1 | 2;
  title: TitleData;
  score: number;
  childHubs: Hub[];
  leaves: LeafElement[];
  totalChildren: number;
  /**
   * Ce hub est une frame, pas un titre : un groupement que l'utilisateur a
   * écrit, et non une structure déduite. La distinction vaut d'être dite au
   * modèle — elle lui indique où le regroupement est sûr.
   */
  isFrame?: boolean;
};

// ---- Constants ----

const IMPLICIT_VERTICAL_THRESHOLD = 300;
const IMPLICIT_HORIZONTAL_MARGIN = 100;
const HEAVY_ORPHAN_MIN_LENGTH = 500;
const LEAF_PRUNE_LIMIT = 5;
const LEVEL_BONUS: Record<string, number> = { h1: 3, h2: 2, h3: 1, p: 0 };
const TYPE_WEIGHT: Record<string, number> = {
  table: 80,
  link: 60,
  image: 40,
  value: 30,
  embed: 25,
  pdf: 20,
  audio: 20,
  video: 20,
  file: 15,
};

/**
 * Les types de node dont le contenu est un document riche sérialisé dans
 * `values.doc`. Ils se pèsent à la longueur de leur `doc`, pas au
 * `TYPE_WEIGHT` forfaitaire — sans quoi un document de 40 ko compte comme un
 * node vide dans la minimap servie à l'agent.
 */
function isRichTextNodeType(type: string): boolean {
  return type === "blocknote";
}

// ---- Main export ----

export const generate = internalQuery({
  args: { canvasId: v.id("canvases") },
  handler: async (ctx, { canvasId }) => {
    const canvas = await ctx.db.get("canvases", canvasId);
    if (!canvas) {
      return { canvasId, hubCount: 0, minimapText: "" };
    }

    // Les types invisibles pour l'agent sortent avant tout calcul : ils ne
    // pèsent ni dans les hubs ni dans les edges de la minimap.
    const tableNodes = await NodeModels.listFromCanvas(ctx, { canvasId });
    const nodes = tableNodes
      .map(NodeModels.toCanvasNode)
      .filter((node) => isNodeTypeReadableByAgent(node.type)) as RawCanvasNode[];
    const edgeDocs = await EdgeModels.listFromCanvas(ctx, { canvasId });
    const edges = edgeDocs.map(EdgeModels.toCanvasEdge) as RawCanvasEdge[];

    const hubs = await buildCanvasHubs(ctx, nodes, edges);

    return {
      canvasId: canvas._id,
      canvasName: canvas.name,
      canvasDescription: canvas.description,
      hubCount: hubs.length,
      minimapText: formatMinimapText(hubs),
    };
  },
});

/**
 * Le plan du canvas : les frames d'abord, puis ce qui vit en dehors.
 *
 * Une frame est le seul groupement que l'utilisateur a ÉCRIT. Tout le reste
 * de cette minimap est de l'inférence — des edges title→node, et à défaut la
 * proximité géométrique. Une frame passe donc devant, et son contenu sort du
 * jeu de l'inférence : sans ça, un node dans une frame serait rattaché deux
 * fois, une fois à sa frame et une fois au titre le plus proche au-dessus,
 * qui peut très bien être à l'extérieur.
 *
 * Le contenu d'une frame est lui-même passé à `buildHubs` : les titres
 * gardent leur rôle d'organisateurs À L'INTÉRIEUR. Et comme les positions d'un
 * enfant sont relatives à sa frame, les enfants d'une même frame partagent
 * leur repère : la proximité s'y calcule sans conversion, du moment qu'on ne
 * les mélange jamais aux nodes du dehors.
 */
async function buildCanvasHubs(
  ctx: QueryCtx,
  nodes: RawCanvasNode[],
  edges: RawCanvasEdge[],
): Promise<Hub[]> {
  const frames = nodes.filter((node) => node.type === "frame");
  if (frames.length === 0) return buildHubs(ctx, nodes, edges);

  const childrenByFrame = new Map<string, RawCanvasNode[]>();
  for (const frame of frames) childrenByFrame.set(frame.id, []);
  const free: RawCanvasNode[] = [];
  for (const node of nodes) {
    if (node.type === "frame") continue;
    const siblings = node.parentId
      ? childrenByFrame.get(node.parentId)
      : undefined;
    if (siblings) siblings.push(node);
    else free.push(node);
  }

  const frameHubs: Hub[] = [];
  for (const frame of frames) {
    const children = childrenByFrame.get(frame.id) ?? [];
    // `buildHubs` ignore les edges dont une extrémité lui est inconnue : lui
    // passer toutes celles du canvas suffit, celles qui traversent la
    // frontière de la frame tombent d'elles-mêmes.
    const innerHubs = await buildHubs(ctx, children, edges);

    const captured = new Set<string>();
    for (const hub of innerHubs) {
      captured.add(hub.title.id);
      for (const leaf of hub.leaves) captured.add(leaf.id);
      for (const child of hub.childHubs) {
        captured.add(child.title.id);
        for (const leaf of child.leaves) captured.add(leaf.id);
      }
    }

    const loose = children.filter((child) => !captured.has(child.id));
    const looseLeaves = await enrichLooseLeaves(ctx, loose);

    frameHubs.push({
      rank: 1,
      title: {
        id: frame.id,
        text: await readFrameTitle(ctx, frame),
        level: "p",
        position: frame.position,
        width: frame.width ?? 0,
        height: frame.height ?? 0,
      },
      score: 0,
      // Les hubs internes redescendent d'un rang : la frame occupe le rang 1,
      // et `formatRank2Hub` ne perd rien au passage — il n'affichait déjà que
      // les feuilles et le compte des enfants.
      childHubs: innerHubs.map((hub) => ({ ...hub, rank: 2 as const })),
      leaves: looseLeaves,
      totalChildren: children.length,
      isFrame: true,
    });
  }

  return [...frameHubs, ...(await buildHubs(ctx, free, edges))];
}

/** Le titre porté par le nodeData d'une frame. */
async function readFrameTitle(
  ctx: QueryCtx,
  frame: RawCanvasNode,
): Promise<string> {
  if (!frame.nodeDataId) return "";
  const nodeData = await ctx.db.get("nodeDatas", frame.nodeDataId);
  if (!nodeData) return "";
  return typeof nodeData.values?.title === "string"
    ? nodeData.values.title
    : "";
}

/**
 * Les nodes d'une frame qu'aucun titre interne n'a captés : ils se listent
 * directement sous elle, au même format que n'importe quelle feuille.
 */
async function enrichLooseLeaves(
  ctx: QueryCtx,
  nodes: RawCanvasNode[],
): Promise<LeafElement[]> {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const nodeDatas = await fetchLeafNodeDatas(
    ctx,
    nodes.map((node) => node.id),
    nodeById,
  );
  return nodes.map((node) => {
    const nodeData = nodeDatas.get(node.id);
    return {
      id: node.id,
      type: node.type,
      title: nodeData ? extractLeafTitle(node.type, nodeData.values ?? {}) : null,
      infoWeight: 0,
    };
  });
}

// ---- Pass 1: Construction & Scoring ----

async function buildHubs(
  ctx: QueryCtx,
  nodes: RawCanvasNode[],
  edges: RawCanvasEdge[],
): Promise<Hub[]> {
  if (nodes.length === 0) return [];

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const titleNodes = nodes.filter((n) => n.type === "title");
  const otherNodes = nodes.filter((n) => n.type !== "title");

  // 1a. Fetch nodeData for title nodes (text + level)
  const titleDataById = await fetchTitleData(ctx, titleNodes);
  const titleIds = new Set(titleNodes.map((n) => n.id));

  // 1b. Build edge graph
  const outEdges = new Map<string, Set<string>>();
  const inEdges = new Map<string, Set<string>>();
  const titleParents = new Map<string, Set<string>>();

  for (const node of nodes) {
    outEdges.set(node.id, new Set());
    inEdges.set(node.id, new Set());
  }
  for (const tid of titleIds) {
    titleParents.set(tid, new Set());
  }

  for (const edge of edges) {
    if (!nodeById.has(edge.source) || !nodeById.has(edge.target)) continue;
    outEdges.get(edge.source)?.add(edge.target);
    inEdges.get(edge.target)?.add(edge.source);
    if (titleIds.has(edge.target) && titleIds.has(edge.source)) {
      titleParents.get(edge.target)?.add(edge.source);
    }
  }

  // 1c. Detect implicit spatial edges: orphan non-titles → nearest title above
  const implicitChildren = new Map<string, Set<string>>();
  const implicitAssigned = new Set<string>();

  for (const tid of titleIds) implicitChildren.set(tid, new Set());

  for (const node of otherNodes) {
    if ((inEdges.get(node.id)?.size ?? 0) > 0) continue;
    const nearestTitleId = findNearestTitleAbove(node, titleDataById);
    if (nearestTitleId) {
      implicitChildren.get(nearestTitleId)?.add(node.id);
      implicitAssigned.add(node.id);
    }
  }

  // 1d. Score each title
  const scores = new Map<string, number>();
  for (const [tid, data] of titleDataById) {
    const explicit = outEdges.get(tid)?.size ?? 0;
    const implicit = implicitChildren.get(tid)?.size ?? 0;
    const bonus = LEVEL_BONUS[data.level] ?? 0;
    scores.set(tid, (explicit + implicit) * 2 + bonus);
  }

  // ---- Pass 2: Arborescence ----

  // Roots = title nodes with no parent title
  const roots = titleNodes
    .filter((n) => (titleParents.get(n.id)?.size ?? 0) === 0)
    .sort((a, b) => (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0));

  const assignedTitles = new Set<string>();
  const assignedLeaves = new Set<string>();
  const rank1Hubs: Hub[] = [];

  for (const root of roots) {
    if (assignedTitles.has(root.id)) continue;
    const hub = buildRank1Hub(
      root.id,
      titleDataById,
      outEdges,
      titleIds,
      implicitChildren,
      scores,
      assignedTitles,
      assignedLeaves,
      nodeById,
    );
    if (hub) rank1Hubs.push(hub);
  }

  // ---- Pass 3: Enrich leaves (fetch nodeData + title) then prune ----

  const allLeafIds = collectLeafIds(rank1Hubs);
  const leafNodeDatas = await fetchLeafNodeDatas(ctx, allLeafIds, nodeById);
  enrichAndPruneHubs(rank1Hubs, nodeById, leafNodeDatas);

  // Heavy orphan non-title nodes not captured by any hub
  const unassigned = otherNodes.filter(
    (n) => !assignedLeaves.has(n.id) && !implicitAssigned.has(n.id),
  );
  const orphanHubs = await buildHeavyOrphanHubs(ctx, unassigned);

  return [...rank1Hubs, ...orphanHubs];
}

async function fetchTitleData(
  ctx: QueryCtx,
  titleNodes: RawCanvasNode[],
): Promise<Map<string, TitleData>> {
  const map = new Map<string, TitleData>();
  await Promise.all(
    titleNodes.map(async (node) => {
      let text = "";
      let level: "h1" | "h2" | "h3" | "p" = "p";
      if (node.nodeDataId) {
        const nd = await ctx.db.get("nodeDatas", node.nodeDataId);
        if (nd) {
          if (typeof nd.values?.text === "string") text = nd.values.text;
          const lvl = nd.values?.level;
          if (lvl === "h1" || lvl === "h2" || lvl === "h3" || lvl === "p") {
            level = lvl;
          }
        }
      }
      map.set(node.id, {
        id: node.id,
        text,
        level,
        position: node.position,
        width: node.width ?? 220,
        height: node.height ?? 33,
      });
    }),
  );
  return map;
}

function findNearestTitleAbove(
  node: RawCanvasNode,
  titleDataById: Map<string, TitleData>,
): string | null {
  let bestId: string | null = null;
  let bestGap = Infinity;

  const nodeLeft = node.position.x;
  const nodeRight = node.position.x + (node.width ?? 0);

  for (const [tid, title] of titleDataById) {
    const vertGap = node.position.y - (title.position.y + title.height);
    if (vertGap < 0 || vertGap > IMPLICIT_VERTICAL_THRESHOLD) continue;

    const titleLeft = title.position.x - IMPLICIT_HORIZONTAL_MARGIN;
    const titleRight =
      title.position.x + title.width + IMPLICIT_HORIZONTAL_MARGIN;
    if (nodeLeft > titleRight || nodeRight < titleLeft) continue;

    if (vertGap < bestGap) {
      bestGap = vertGap;
      bestId = tid;
    }
  }

  return bestId;
}

// ---- Hub building (Pass 2) ----

function buildRank1Hub(
  titleId: string,
  titleDataById: Map<string, TitleData>,
  outEdges: Map<string, Set<string>>,
  titleIds: Set<string>,
  implicitChildren: Map<string, Set<string>>,
  scores: Map<string, number>,
  assignedTitles: Set<string>,
  assignedLeaves: Set<string>,
  nodeById: Map<string, RawCanvasNode>,
): Hub | null {
  const titleData = titleDataById.get(titleId);
  if (!titleData) return null;

  assignedTitles.add(titleId);

  const childHubs: Hub[] = [];
  const leaves: LeafElement[] = [];

  for (const childId of outEdges.get(titleId) ?? []) {
    if (titleIds.has(childId)) {
      if (!assignedTitles.has(childId)) {
        const child = buildRank2Hub(
          childId,
          titleDataById,
          outEdges,
          titleIds,
          implicitChildren,
          scores,
          assignedTitles,
          assignedLeaves,
          nodeById,
        );
        childHubs.push(child);
      }
    } else if (!assignedLeaves.has(childId)) {
      const node = nodeById.get(childId);
      if (node) {
        assignedLeaves.add(childId);
        leaves.push({
          id: childId,
          type: node.type,
          title: null,
          infoWeight: 0,
        });
      }
    }
  }

  for (const childId of implicitChildren.get(titleId) ?? []) {
    if (!assignedLeaves.has(childId)) {
      const node = nodeById.get(childId);
      if (node) {
        assignedLeaves.add(childId);
        leaves.push({
          id: childId,
          type: node.type,
          title: null,
          infoWeight: 0,
        });
      }
    }
  }

  const totalChildren = childHubs.length + leaves.length;
  if (totalChildren === 0) return null;

  return {
    rank: 1,
    title: titleData,
    score: scores.get(titleId) ?? 0,
    childHubs,
    leaves,
    totalChildren,
  };
}

function buildRank2Hub(
  titleId: string,
  titleDataById: Map<string, TitleData>,
  outEdges: Map<string, Set<string>>,
  titleIds: Set<string>,
  implicitChildren: Map<string, Set<string>>,
  scores: Map<string, number>,
  assignedTitles: Set<string>,
  assignedLeaves: Set<string>,
  nodeById: Map<string, RawCanvasNode>,
): Hub {
  const titleData = titleDataById.get(titleId) ?? {
    id: titleId,
    text: "",
    level: "p" as const,
    position: { x: 0, y: 0 },
    width: 220,
    height: 33,
  };

  assignedTitles.add(titleId);

  const leaves: LeafElement[] = [];

  for (const childId of outEdges.get(titleId) ?? []) {
    if (!titleIds.has(childId) && !assignedLeaves.has(childId)) {
      const node = nodeById.get(childId);
      if (node) {
        assignedLeaves.add(childId);
        leaves.push({
          id: childId,
          type: node.type,
          title: null,
          infoWeight: 0,
        });
      }
    }
  }

  for (const childId of implicitChildren.get(titleId) ?? []) {
    if (!assignedLeaves.has(childId)) {
      const node = nodeById.get(childId);
      if (node) {
        assignedLeaves.add(childId);
        leaves.push({
          id: childId,
          type: node.type,
          title: null,
          infoWeight: 0,
        });
      }
    }
  }

  return {
    rank: 2,
    title: titleData,
    score: scores.get(titleId) ?? 0,
    childHubs: [],
    leaves,
    totalChildren: leaves.length,
  };
}

// ---- Leaf enrichment and pruning (Pass 3) ----

function collectLeafIds(hubs: Hub[]): string[] {
  const ids: string[] = [];
  for (const hub of hubs) {
    for (const leaf of hub.leaves) ids.push(leaf.id);
    for (const child of hub.childHubs) {
      for (const leaf of child.leaves) ids.push(leaf.id);
    }
  }
  return ids;
}

async function fetchLeafNodeDatas(
  ctx: QueryCtx,
  leafIds: string[],
  nodeById: Map<string, RawCanvasNode>,
): Promise<Map<string, { type: string; values: Record<string, unknown> }>> {
  const map = new Map<
    string,
    { type: string; values: Record<string, unknown> }
  >();
  await Promise.all(
    leafIds.map(async (lid) => {
      const node = nodeById.get(lid);
      if (!node?.nodeDataId) return;
      const nd = await ctx.db.get("nodeDatas", node.nodeDataId);
      if (nd)
        map.set(lid, {
          type: nd.type as string,
          values: nd.values as Record<string, unknown>,
        });
    }),
  );
  return map;
}

function enrichAndPruneHubs(
  hubs: Hub[],
  nodeById: Map<string, RawCanvasNode>,
  leafNodeDatas: Map<string, { type: string; values: Record<string, unknown> }>,
): void {
  for (const hub of hubs) {
    enrichLeaves(hub.leaves, nodeById, leafNodeDatas);
    for (const child of hub.childHubs) {
      enrichLeaves(child.leaves, nodeById, leafNodeDatas);
    }
  }
}

function enrichLeaves(
  leaves: LeafElement[],
  nodeById: Map<string, RawCanvasNode>,
  leafNodeDatas: Map<string, { type: string; values: Record<string, unknown> }>,
): void {
  for (const leaf of leaves) {
    const nd = leafNodeDatas.get(leaf.id);
    if (!nd) continue;
    const node = nodeById.get(leaf.id);
    if (!node) continue;

    if (isRichTextNodeType(nd.type)) {
      const doc = nd.values.doc;
      leaf.infoWeight = (typeof doc === "string" ? doc.length : 0) + 100;
    } else {
      leaf.infoWeight = TYPE_WEIGHT[nd.type] ?? 10;
    }

    leaf.title = extractLeafTitle(nd.type, nd.values);
  }

  leaves.sort((a, b) => b.infoWeight - a.infoWeight);
  leaves.splice(LEAF_PRUNE_LIMIT);
}

function extractLeafTitle(
  type: string,
  values: Record<string, unknown>,
): string | null {
  switch (type) {
    case "link": {
      const link = values.link as
        | { pageTitle?: string; href?: string }
        | undefined;
      return link?.pageTitle ?? link?.href ?? null;
    }
    case "table":
      return typeof values.title === "string" ? values.title : null;
    case "value": {
      const val = values.value as
        | { label?: string; value?: unknown }
        | undefined;
      if (val?.label) return val.label;
      if (val?.value !== undefined) return String(val.value) || null;
      return null;
    }
    case "embed": {
      const embed = values.embed as { title?: string } | undefined;
      return embed?.title ?? null;
    }
    default:
      return null;
  }
}

async function buildHeavyOrphanHubs(
  ctx: QueryCtx,
  nodes: RawCanvasNode[],
): Promise<Hub[]> {
  const results = await Promise.all(
    nodes
      .filter((n) => isRichTextNodeType(n.type))
      .map(async (node): Promise<Hub | null> => {
        if (!node.nodeDataId) return null;
        const nd = await ctx.db.get("nodeDatas", node.nodeDataId);
        if (!nd) return null;
        const doc = nd.values?.doc;
        if (typeof doc !== "string" || doc.length < HEAVY_ORPHAN_MIN_LENGTH)
          return null;
        const text = getNodeDataTitle(nd) ?? node.type;
        return {
          rank: 1,
          title: {
            id: node.id,
            text,
            level: "p",
            position: node.position,
            width: node.width ?? 0,
            height: node.height ?? 0,
          },
          score: 0,
          childHubs: [],
          leaves: [],
          totalChildren: 0,
        };
      }),
  );
  return results.filter((h): h is Hub => h !== null);
}

// ---- Output formatting ----

function formatMinimapText(hubs: Hub[]): string {
  return hubs.map(formatRank1Hub).join("\n\n");
}

function formatRank1Hub(hub: Hub): string {
  const { title, childHubs, leaves } = hub;
  const textPart = title.text.trim() ? ` ${title.text.trim()}` : "";
  // 📦 pour une frame, 📍 pour un hub déduit d'un titre : ce n'est pas la même
  // certitude, et la légende du prompt le dit.
  //
  // La frame donne aussi sa taille : c'est un rectangle réel, et c'est dedans
  // que l'agent doit viser quand il y crée un node. Un hub 📍 n'en a pas — il
  // est déduit d'un titre et de ses voisins, sa « taille » ne voudrait rien
  // dire.
  const header = hub.isFrame
    ? `📦 ${title.id} [frame]${textPart} (${hub.totalChildren} nodes, x:${Math.round(title.position.x)}, y:${Math.round(title.position.y)}, w:${Math.round(title.width)}, h:${Math.round(title.height)})`
    : `📍 ${title.id}${textPart} (x:${Math.round(title.position.x)}, y:${Math.round(title.position.y)})`;

  const lines: string[] = [header];

  childHubs.forEach((child, i) => {
    const isLast = i === childHubs.length - 1 && leaves.length === 0;
    lines.push(...formatRank2Hub(child, isLast));
  });

  leaves.forEach((leaf, i) => {
    const isLast = i === leaves.length - 1;
    lines.push(`${isLast ? "└─" : "├─"} ${formatLeaf(leaf)}`);
  });

  return lines.join("\n");
}

function formatRank2Hub(hub: Hub, isLast: boolean): string[] {
  const { title, leaves, totalChildren } = hub;
  const prefix = isLast ? "└─" : "├─";
  const indent = isLast ? "   " : "│  ";
  const textPart = title.text.trim() ? ` ${title.text.trim()}` : "";
  const childrenLabel = totalChildren > 0 ? ` (${totalChildren} children)` : "";
  const header = `${prefix} ${title.id} [title]${textPart}${childrenLabel}`;

  const leafLines = leaves.map((leaf, i) => {
    const isLastLeaf = i === leaves.length - 1;
    return `${indent}${isLastLeaf ? "└─" : "├─"} ${formatLeaf(leaf)}`;
  });

  return [header, ...leafLines];
}

function formatLeaf(leaf: LeafElement): string {
  const titlePart = leaf.title ? ` ${leaf.title}` : "";
  return `${leaf.id} [${leaf.type}]${titlePart}`;
}
