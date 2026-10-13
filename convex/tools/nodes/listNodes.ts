import { v, type Infer } from "convex/values";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { isNodeTypeReadableByAgent } from "../../config/nodeConfig";
import type { ToolRunCtx } from "../runtime";
import type { ToolScope } from "../scope";
import type { CanvasGraph } from "./canvasGraph";
import { readNodeTitles } from "./nodeContents";

/**
 * Noyau : les nodes d'un canvas, filtrés, dans le scope de l'appelant.
 *
 * Rend des données, jamais du texte : la mise en forme (XML pour le modèle,
 * lignes pour le CLI…) et les plafonds d'affichage sont l'affaire des
 * adaptateurs. Pas de limite non plus : un adaptateur tronque, le noyau rend
 * tout.
 */

/** Rayon du filtre `near`, en unités du canvas. */
export const NEAR_RADIUS = 500;

export const vListNodesFilters = v.object({
  types: v.optional(v.array(v.string())),
  /** Les nodes reliés à celui-ci par une edge, dans ce sens. */
  linkedTo: v.optional(
    v.object({
      nodeId: v.string(),
      direction: v.union(
        v.literal("input"),
        v.literal("output"),
        v.literal("both"),
      ),
    }),
  ),
  /** Position monde dans ce rectangle (coin haut-gauche, coin bas-droit). */
  area: v.optional(
    v.object({ x1: v.number(), y1: v.number(), x2: v.number(), y2: v.number() }),
  ),
  /** Position monde à moins de `NEAR_RADIUS` de ce node. */
  near: v.optional(v.object({ nodeId: v.string() })),
  /** Les enfants directs de cette frame. */
  frameId: v.optional(v.string()),
});

export type ListNodesFilters = Infer<typeof vListNodesFilters>;

export type NodeSummary = {
  id: string;
  type: string;
  title: string;
  /** Position monde (celle d'un node dans une frame est relative à elle). */
  x: number;
  y: number;
  frameId: string | null;
  color: string | null;
  /** Avec `linkedTo` : les labels des edges suivies jusqu'à ce node. */
  edgeLabels: string[];
};

export type ListNodesResult =
  | {
      ok: true;
      nodes: NodeSummary[];
      /** Les templates des custom nodes listés (titres, schémas). */
      templates: Doc<"nodeTemplates">[];
    }
  | { ok: false; error: string };

type Match = Omit<NodeSummary, "title">;

/** Le filtrage, sur la seule structure : pur, sans lecture. */
export function filterGraph(
  graph: CanvasGraph,
  filters: ListNodesFilters,
): { ok: true; nodes: Match[] } | { ok: false; error: string } {
  // Un id de référence introuvable est une erreur, pas une liste vide : sans
  // ça, une frame mal recopiée ressemble à une frame vide.
  const exists = (nodeId: string) =>
    graph.nodes.some((node) => node.id === nodeId);
  if (filters.frameId && !exists(filters.frameId)) {
    return { ok: false, error: `Frame "${filters.frameId}" not found on canvas` };
  }
  if (filters.linkedTo && !exists(filters.linkedTo.nodeId)) {
    return {
      ok: false,
      error: `Node "${filters.linkedTo.nodeId}" not found on canvas`,
    };
  }

  let linked: Map<string, string[]> | null = null;
  if (filters.linkedTo) {
    const { nodeId, direction } = filters.linkedTo;
    linked = new Map();
    const add = (connectedId: string, label: string | null) => {
      const labels = linked!.get(connectedId) ?? [];
      if (label) labels.push(label);
      linked!.set(connectedId, labels);
    };
    for (const edge of graph.edges) {
      if (direction !== "input" && edge.source === nodeId) {
        add(edge.target, edge.label);
      }
      if (direction !== "output" && edge.target === nodeId) {
        add(edge.source, edge.label);
      }
    }
  }

  let nearCenter: { x: number; y: number } | null = null;
  if (filters.near) {
    const { nodeId } = filters.near;
    const center = graph.nodes.find((node) => node.id === nodeId);
    if (!center) {
      return { ok: false, error: `Reference node "${nodeId}" not found on canvas` };
    }
    nearCenter = center;
  }

  const { types, area, frameId } = filters;
  const nodes = graph.nodes
    .filter((node) => {
      // Types invisibles pour l'agent : jamais listés, quels que soient les
      // filtres.
      if (!isNodeTypeReadableByAgent(node.type)) return false;
      if (types && types.length > 0 && !types.includes(node.type)) return false;
      if (linked && !linked.has(node.id)) return false;
      if (frameId && node.frameId !== frameId) return false;
      if (area) {
        if (
          node.x < area.x1 ||
          node.x > area.x2 ||
          node.y < area.y1 ||
          node.y > area.y2
        ) {
          return false;
        }
      }
      if (nearCenter) {
        const dx = node.x - nearCenter.x;
        const dy = node.y - nearCenter.y;
        if (Math.sqrt(dx * dx + dy * dy) > NEAR_RADIUS) return false;
      }
      return true;
    })
    .map((node) => ({
      id: node.id,
      type: node.type,
      x: node.x,
      y: node.y,
      frameId: node.frameId,
      color: node.color,
      edgeLabels: linked?.get(node.id) ?? [],
    }));
  return { ok: true, nodes };
}

export async function listNodes(
  ctx: ToolRunCtx,
  scope: ToolScope,
  filters: ListNodesFilters,
): Promise<ListNodesResult> {
  const graph = await ctx.runQuery(internal.tools.nodes.canvasGraph.load, {
    scope,
  });
  const matched = filterGraph(graph, filters);
  if (!matched.ok) return matched;

  const titles = await readNodeTitles(
    ctx,
    scope,
    matched.nodes.map((node) => node.id),
  );

  // Dans l'ordre des nodes listés : c'est l'ordre des schémas rendus.
  const templateIds: Id<"nodeTemplates">[] = [];
  for (const node of matched.nodes) {
    const templateId = titles.get(node.id)?.templateId;
    if (templateId && !templateIds.includes(templateId)) {
      templateIds.push(templateId);
    }
  }
  const templates =
    templateIds.length > 0
      ? await ctx.runQuery(internal.wrappers.nodeTemplateWrappers.getTemplates, {
          templateIds,
        })
      : [];

  return {
    ok: true,
    nodes: matched.nodes.map((node) => ({
      ...node,
      title: titles.get(node.id)?.title ?? "Untitled",
    })),
    templates,
  };
}
