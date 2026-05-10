import { v } from "convex/values";
import { action } from "./_generated/server";
import { components, internal } from "./_generated/api";
import { createAutomationAgent } from "./ia/agents";
import { createThread } from "@convex-dev/agent";
import { requireAuth } from "./lib/auth";
import {
  generateInputNodesContext,
  makeNodeDataLLMFriendly,
} from "./ia/helpers/makeNodeDataLLMFriendly";
import { createProgressReporter } from "./automation/progressReporter";

export const trigger = action({
  args: {
    nodeDataId: v.id("nodeDatas"),
  },
  handler: async (ctx, { nodeDataId }) => {
    try {
      console.log("Automation triggered");
      const userId = await requireAuth(ctx);

      const currentNodeData = await ctx.runQuery(
        internal.wrappers.nodeDataWrappers.readNodeData,
        { _id: nodeDataId },
      );

      // 1. Passer le statut en working et initialiser les infos d'automationProgress
      const reportProgress = createProgressReporter(ctx, nodeDataId);
      await ctx.runMutation(internal.wrappers.nodeDataWrappers.updateStatus, {
        _id: nodeDataId,
        status: "working",
      });
      await reportProgress({
        stepType: "automation_launched",
      });

      // 2. Charger les nodeData input du noeud courant
      const inputNodeDatas = await ctx.runQuery(
        internal.wrappers.nodeDataWrappers.listNodeDataDependencies,
        {
          nodeDataId,
          type: "input",
        },
      );

      // 3. Exécuter l'agent associé au noeud courant
      const automationAgent = createAutomationAgent({
        threadCtx: {
          authUserId: userId,
          canvasId: currentNodeData.canvasId,
        },
      });
      const threadId = await createThread(ctx, components.agent, {
        userId,
        title: "__automation_thread__ - automation for nodeData " + nodeDataId,
      });
      const inputNodesContext = await generateInputNodesContext(inputNodeDatas);
      const currentNodeContext = await makeNodeDataLLMFriendly(currentNodeData);

      const response = await automationAgent.generateText(
        {
          ...ctx,
          currentNodeData,
          reportProgress,
        } as typeof ctx & {
          currentNodeData: typeof currentNodeData;
          reportProgress: typeof reportProgress;
        },
        { threadId },
        {
          prompt: `Here are the available input data for the current node:
${inputNodesContext}
          Here are the current data of the node (entered by the user or by you in a previous execution):
${currentNodeContext}

          ------

          User instructions for this node:
          ${currentNodeData?.agent?.instructions}`,
        },
      );

      console.log("Agent response:", response.text);

      // 5. Repasser le statut en idle
      await ctx.runMutation(internal.wrappers.nodeDataWrappers.updateStatus, {
        _id: nodeDataId,
        status: "idle",
      });
      await reportProgress({
        stepType: "automation_completed",
      });

      // X. Lancer les automations des noeuds suivants (à implémenter)
    } catch (error) {
      console.error("Error triggering automation:", error);
      // En cas d'erreur, passer le statut en error
      await ctx.runMutation(internal.wrappers.nodeDataWrappers.updateStatus, {
        _id: nodeDataId,
        status: "error",
      });
    }
  },
});
