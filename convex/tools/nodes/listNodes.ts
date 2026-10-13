import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";
import { isNodeTypeReadableByAgent } from "../../config/nodeConfig";
import { getEdgeLabel } from "../../ia/tools/toolHelpers";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import { absolutePositionsById } from "../../lib/nodeGeometry";
import * as EdgeModels from "../../models/edgeModels";
import * as NodeModels from "../../models/nodeModels";
import { canReadNode, vToolScope, type ToolScope } from "../scope";

/**
 * Noyau : les nodes d'un canvas, filtrés, dans le scope de l'appelant.
 *
 * Rend des données, jamais du texte : la mise en forme (XML pour le modèle,
 * lignes pour le CLI…) et les plafonds d'affichage sont l'affaire des
 * adaptateurs. Une seule transaction : nodes, edges, nodeDatas et templates
 * sont lus ensemble, donc cohérents entre eux.
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

export async function listNodes(
  ctx: QueryCtx,
  scope: ToolScope,
  filters: ListNodesFilters,
): Promise<ListNodesResult> {
  const allNodes = (
    await NodeModels.listFromCanvas(ctx, { canvasId: scope.canvasId })
  ).map(NodeModels.toCanvasNode);
  // Positions MONDE : un node qui vit dans une frame porte une position
  // relative à elle, et tout ce qui suit raisonne en monde. Calculées avant
  // le filtre de scope : une frame invisible décale quand même ses enfants.
  const positionById = absolutePositionsById(allNodes);
  const canvasNodes = allNodes.filter((node) => canReadNode(scope, node.id));

  let linked: Map<string, string[]> | null = null;
  if (filters.linkedTo) {
    const { nodeId, direction } = filters.linkedTo;
    linked = new Map();
    const edges = await EdgeModels.listFromCanvas(ctx, {
      canvasId: scope.canvasId,
    });
    const add = (connectedId: string, label: string | null) => {
      const labels = linked!.get(connectedId) ?? [];
      if (label) labels.push(label);
      linked!.set(connectedId, labels);
    };
    for (const edge of edges.map(EdgeModels.toCanvasEdge)) {
      const label = getEdgeLabel(edge);
      if (direction !== "input" && edge.source === nodeId) {
        add(edge.target, label);
      }
      if (direction !== "output" && edge.target === nodeId) {
        add(edge.source, label);
      }
    }
  }

  let nearCenter: { x: number; y: number } | null = null;
  if (filters.near) {
    const { nodeId } = filters.near;
    const center = canReadNode(scope, nodeId)
      ? positionById.get(nodeId)
      : undefined;
    if (!center) {
      return { ok: false, error: `Reference node "${nodeId}" not found on canvas` };
    }
    nearCenter = center;
  }

  const { types, area, frameId } = filters;
  const matching = canvasNodes.filter((node) => {
    // Types invisibles pour l'agent : jamais listés, quels que soient les
    // filtres.
    if (!isNodeTypeReadableByAgent(node.type)) return false;
    if (types && types.length > 0 && !types.includes(node.type)) return false;
    if (linked && !linked.has(node.id)) return false;
    if (frameId && node.parentId !== frameId) return false;

    const position = positionById.get(node.id) ?? node.position;
    if (area) {
      if (
        position.x < area.x1 ||
        position.x > area.x2 ||
        position.y < area.y1 ||
        position.y > area.y2
      ) {
        return false;
      }
    }
    if (nearCenter) {
      const dx = position.x - nearCenter.x;
      const dy = position.y - nearCenter.y;
      if (Math.sqrt(dx * dx + dy * dy) > NEAR_RADIUS) return false;
    }
    return true;
  });

  const templates = new Map<Id<"nodeTemplates">, Doc<"nodeTemplates"> | null>();
  const getTemplate = async (templateId: Id<"nodeTemplates">) => {
    if (!templates.has(templateId)) {
      templates.set(templateId, await ctx.db.get("nodeTemplates", templateId));
    }
    return templates.get(templateId) ?? null;
  };

  const nodes: NodeSummary[] = [];
  for (const node of matching) {
    let title = "Untitled";
    const nodeData = node.nodeDataId
      ? await ctx.db.get("nodeDatas", node.nodeDataId)
      : null;
    if (nodeData) {
      const template = nodeData.templateId
        ? await getTemplate(nodeData.templateId)
        : null;
      title = getNodeDataTitle(nodeData, template);
    }
    const position = positionById.get(node.id) ?? node.position;
    nodes.push({
      id: node.id,
      type: node.type,
      title,
      x: position.x,
      y: position.y,
      frameId: node.parentId ?? null,
      edgeLabels: linked?.get(node.id) ?? [],
    });
  }

  return {
    ok: true,
    nodes,
    templates: [...templates.values()].filter(
      (template): template is Doc<"nodeTemplates"> => template !== null,
    ),
  };
}

export const list = internalQuery({
  args: { scope: vToolScope, filters: vListNodesFilters },
  handler: (ctx, { scope, filters }) => listNodes(ctx, scope, filters),
});
