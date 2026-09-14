import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { readStoredImages } from "../../lib/storedImages";
import { toModelImageUrl } from "../../lib/imageTransform";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { EXPLANATION_FIELD, type ToolConfig, toolError } from "./toolHelpers";

export const viewImageToolConfig: ToolConfig = {
  name: "view_image",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.worker,
  ],
  requireMultiModal: true,
};

/** Même plafond que `read_nodes` : une image coûte ~800 tokens par step restant. */
const MAX_VIEW_IMAGES = 4;

type ViewImageOutput =
  | { success: true; urls: string[] }
  | { success: false; message: string };

export default function viewImageTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Look at one or more images yourself, instead of relying on their indexed text description. " +
      "Pass `nodeId` for an image node of the current canvas (preferred: short, and it reads the node's current images), " +
      "or `url` for an image that is not on the canvas (a web search result, a page you opened). " +
      `Exactly one of the two. At most ${MAX_VIEW_IMAGES} images are returned.`,
    inputSchema: z.object({
      explanation: EXPLANATION_FIELD,
      // Le « exactement un des deux » est vérifié dans `execute`, jamais par un
      // `.refine()` : celui-ci produit un ZodEffects sans `.shape`, et
      // `getZodObjectSchema` (mcp/registry.ts) rend `null` là-dessus — le tool
      // disparaîtrait silencieusement du endpoint MCP. `view_image` n'y est pas
      // exposé aujourd'hui, mais on ne pose pas la mine pour les suivants.
      nodeId: z
        .string()
        .optional()
        .describe(
          "The id of an image node on the current canvas. Its images are read live.",
        ),
      url: z
        .string()
        .optional()
        .describe(
          "The URL of an image to fetch and view. Use it only for images that are not on the canvas.",
        ),
    }),
    execute: async (ctx, input): Promise<ViewImageOutput> => {
      const hasNodeId = typeof input.nodeId === "string" && input.nodeId !== "";
      const hasUrl = typeof input.url === "string" && input.url !== "";

      if (hasNodeId === hasUrl) {
        return {
          success: false,
          message: hasNodeId
            ? "Pass either nodeId or url, not both."
            : "Pass either nodeId (an image node of this canvas) or url.",
        };
      }

      if (hasUrl) {
        console.log(`🖼️ Routing image URL to model: ${input.url}`);
        return { success: true, urls: [toModelImageUrl(input.url as string)] };
      }

      const nodeId = input.nodeId as string;
      try {
        const { nodeData } = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
          { canvasId: canvasId as Id<"canvases">, nodeId },
        );

        if (nodeData.type !== "image") {
          return {
            success: false,
            message: `Node ${nodeId} is a "${nodeData.type}" node, not an image node. Use read_nodes to read it.`,
          };
        }

        const images = readStoredImages(nodeData.values);
        if (images.length === 0) {
          return {
            success: false,
            message: `Node ${nodeId} holds no image yet.`,
          };
        }

        console.log(
          `🖼️ Routing ${Math.min(images.length, MAX_VIEW_IMAGES)} image(s) of node ${nodeId} to model`,
        );
        return {
          success: true,
          urls: images
            .slice(0, MAX_VIEW_IMAGES)
            .map((image) => toModelImageUrl(image.url)),
        };
      } catch (error) {
        return {
          success: false,
          message: `Failed to read node ${nodeId}: ${
            error instanceof Error ? error.message : "Unknown error"
          }. Verify the id with list_nodes.`,
        };
      }
    },
    toModelOutput: (_ctx, { output }) => {
      if (!output.success) {
        return { type: "error-text", value: toolError(output.message) };
      }
      return {
        type: "content",
        value: output.urls.map((url) => ({ type: "image-url" as const, url })),
      };
    },
  });
}
