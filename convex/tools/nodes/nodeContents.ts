import { v } from "convex/values";
import type { Doc } from "../../_generated/dataModel";
import { internalQuery, type QueryCtx } from "../../_generated/server";
import errors from "../../config/errorsConfig";
import { getNodeDataTitle } from "../../lib/getNodeDataTitle";
import * as NodeModels from "../../models/nodeModels";
import {
  CONTENT_BATCH_SIZE,
  inBatches,
  mapConcurrently,
  type ToolRunCtx,
} from "../runtime";
import { canReadNode, vToolScope, type ToolScope } from "../scope";
import { internal } from "../../_generated/api";

/**
 * Noyau : le contenu des nodes (nodeData et template), par lots bornés.
 *
 * Deux lectures : le contenu entier, pour qui va le rendre, et le seul titre,
 * pour qui ne fait que citer un node (connexion, mention, enfant de frame,
 * cellule de table) — sans faire transiter son document jusqu'à l'action.
 */

export type NodeContent =
  | {
      id: string;
      ok: true;
      type: string;
      nodeData: Doc<"nodeDatas">;
      template: Doc<"nodeTemplates"> | null;
      /** Le titre que l'utilisateur voit (celui d'un custom node vient de son template). */
      title: string;
    }
  | { id: string; ok: false; error: string };

async function readContent(
  ctx: QueryCtx,
  scope: ToolScope,
  nodeId: string,
): Promise<NodeContent> {
  const node = canReadNode(scope, nodeId)
    ? await NodeModels.getNodeByLlmId(ctx, { nodeId })
    : null;
  if (!node || node.status === "trashed" || node.canvasId !== scope.canvasId) {
    return {
      id: nodeId,
      ok: false,
      error: `${errors.NODE_NOT_FOUND} NodeId: ${nodeId} ; CanvasId: ${scope.canvasId}`,
    };
  }
  const nodeData = await ctx.db.get("nodeDatas", node.nodeDataId);
  if (!nodeData) {
    return {
      id: nodeId,
      ok: false,
      error: `${errors.NODE_DATA_NOT_FOUND} NodeId: ${nodeId} ; CanvasId: ${scope.canvasId}`,
    };
  }
  const template = nodeData.templateId
    ? await ctx.db.get("nodeTemplates", nodeData.templateId)
    : null;
  return {
    id: nodeId,
    ok: true,
    type: node.type,
    nodeData,
    template,
    // Un titre fait d'espaces ou suivi d'un retour à la ligne (une valeur
    // tapée telle quelle) ne doit pas casser une ligne de sortie.
    title: getNodeDataTitle(nodeData, template).trim() || "Untitled",
  };
}

const vBatch = v.array(v.string());

function assertBatch(nodeIds: string[]) {
  if (nodeIds.length > CONTENT_BATCH_SIZE) {
    throw new Error(
      `At most ${CONTENT_BATCH_SIZE} nodes per batch, got ${nodeIds.length}.`,
    );
  }
}

export const contents = internalQuery({
  args: { scope: vToolScope, nodeIds: vBatch },
  handler: async (ctx, { scope, nodeIds }): Promise<NodeContent[]> => {
    assertBatch(nodeIds);
    return Promise.all(nodeIds.map((id) => readContent(ctx, scope, id)));
  },
});

export const titles = internalQuery({
  args: { scope: vToolScope, nodeIds: vBatch },
  handler: async (
    ctx,
    { scope, nodeIds },
  ): Promise<
    Array<{ id: string; title: string | null; updatedAt: number | null }>
  > => {
    assertBatch(nodeIds);
    return Promise.all(
      nodeIds.map(async (id) => {
        const content = await readContent(ctx, scope, id);
        return content.ok
          ? { id, title: content.title, updatedAt: content.nodeData.updatedAt }
          : { id, title: null, updatedAt: null };
      }),
    );
  },
});

/** Le contenu de ces nodes, dans l'ordre demandé (doublons compris). */
export async function readNodeContents(
  ctx: ToolRunCtx,
  scope: ToolScope,
  nodeIds: readonly string[],
): Promise<NodeContent[]> {
  const byId = new Map<string, NodeContent>();
  await mapConcurrently(inBatches([...new Set(nodeIds)]), async (batch) => {
    for (const content of await ctx.runQuery(
      internal.tools.nodes.nodeContents.contents,
      { scope, nodeIds: batch },
    )) {
      byId.set(content.id, content);
    }
  });
  return nodeIds.map((id) => byId.get(id)!);
}

export type NodeTitle = {
  title: string | null;
  /** Dernière modification du contenu (pas d'un déplacement ni d'une couleur). */
  updatedAt: number | null;
};

/**
 * Le titre de ces nodes (`null` : introuvable dans le scope) et la date de
 * dernière modification de leur contenu.
 */
export async function readNodeTitles(
  ctx: ToolRunCtx,
  scope: ToolScope,
  nodeIds: Iterable<string>,
): Promise<Map<string, NodeTitle>> {
  const result = new Map<string, NodeTitle>();
  await mapConcurrently(inBatches([...new Set(nodeIds)]), async (batch) => {
    for (const { id, ...title } of await ctx.runQuery(
      internal.tools.nodes.nodeContents.titles,
      { scope, nodeIds: batch },
    )) {
      result.set(id, title);
    }
  });
  return result;
}
