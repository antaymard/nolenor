import type { Id } from "../../_generated/dataModel";
import { internalQuery } from "../../_generated/server";
import { getEdgeLabel } from "../../ia/tools/toolHelpers";
import { absolutePositionsById } from "../../lib/nodeGeometry";
import * as EdgeModels from "../../models/edgeModels";
import * as NodeModels from "../../models/nodeModels";
import { canReadNode, vToolScope } from "../scope";

/**
 * Noyau : la structure d'un canvas — ses nodes et ses edges, sans aucun
 * contenu. Petits documents, lus d'un bloc ; les contenus (nodeDatas) se
 * lisent à part, par lots (cf. `runtime.ts`).
 *
 * Déjà réduite au scope de lecture : un node hors scope n'y est pas, ni
 * aucune edge qui le touche.
 */

export type GraphNode = {
  id: string;
  type: string;
  /** Position MONDE : celle d'un node dans une frame est relative à elle. */
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  /** La frame qui le contient. */
  frameId: string | null;
  nodeDataId: Id<"nodeDatas"> | null;
};

export type GraphEdge = {
  source: string;
  target: string;
  /** `null` : absent, effacé ou vide. */
  label: string | null;
};

export type CanvasGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

export const load = internalQuery({
  args: { scope: vToolScope },
  handler: async (ctx, { scope }): Promise<CanvasGraph> => {
    const allNodes = (
      await NodeModels.listFromCanvas(ctx, { canvasId: scope.canvasId })
    ).map(NodeModels.toCanvasNode);
    // Calculées avant le filtre de scope : une frame invisible décale quand
    // même ses enfants.
    const positionById = absolutePositionsById(allNodes);

    const nodes = allNodes
      .filter((node) => canReadNode(scope, node.id))
      .map((node): GraphNode => {
        const position = positionById.get(node.id) ?? node.position;
        return {
          id: node.id,
          type: node.type,
          x: position.x,
          y: position.y,
          width: typeof node.width === "number" ? node.width : null,
          height: typeof node.height === "number" ? node.height : null,
          frameId: node.parentId ?? null,
          nodeDataId: node.nodeDataId ?? null,
        };
      });

    const edges = (
      await EdgeModels.listFromCanvas(ctx, { canvasId: scope.canvasId })
    )
      .map(EdgeModels.toCanvasEdge)
      .filter(
        (edge) =>
          canReadNode(scope, edge.source) && canReadNode(scope, edge.target),
      )
      .map((edge) => ({
        source: edge.source,
        target: edge.target,
        label: getEdgeLabel(edge),
      }));

    return { nodes, edges };
  },
});
