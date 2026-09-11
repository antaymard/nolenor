import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
} from "../_generated/server";
import * as NodeModels from "../models/nodeModels";
import { nodesValidator } from "../schemas/nodesSchema";
import { nodeDataVersionActorValidator } from "../schemas/nodeDataVersionsSchema";

const nodeCreateValidator = nodesValidator.omit("id", "nodeDataId", "status");

/**
 * Orchestrateur interne (agent, scheduler) : crée le nodeData PUIS le node
 * dans la même transaction, via `NodeModels.createNodeWithData` — la même
 * fonction que la mutation publique `nodes.createWithNodeData`. Retourne les deux ids :
 * l'agent a besoin du `nodeDataId` (lecture/édition) comme du `nodeId`
 * (position, edges).
 */
export const createWithNodeData = internalMutation({
  args: {
    node: nodeCreateValidator,
    nodeDataValues: v.record(v.string(), v.any()),
    nodeDataTemplateId: v.optional(v.id("nodeTemplates")),
    actor: v.optional(nodeDataVersionActorValidator),
  },
  returns: v.object({
    nodeId: v.string(),
    nodeDataId: v.id("nodeDatas"),
  }),
  handler: async (ctx, args) => {
    return NodeModels.createNodeWithData(ctx, {
      node: args.node,
      values: args.nodeDataValues,
      templateId: args.nodeDataTemplateId,
      actor: args.actor,
    });
  },
});

export const trash = internalMutation({
  args: {
    nodeId: v.string(),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    return NodeModels.trashNode(ctx, { nodeId: args.nodeId });
  },
});

export const read = internalQuery({
  args: {
    nodeId: v.string(),
  },
  handler: async (ctx, args) => {
    return NodeModels.getNodeOrThrow(ctx, { nodeId: args.nodeId });
  },
});

/** Résolution inverse pour la recherche (cf. resolveNodeIds). */
export const getByNodeDataId = internalQuery({
  args: {
    nodeDataId: v.id("nodeDatas"),
  },
  handler: async (ctx, args) => {
    return NodeModels.getNodeByNodeDataId(ctx, {
      nodeDataId: args.nodeDataId,
    });
  },
});
