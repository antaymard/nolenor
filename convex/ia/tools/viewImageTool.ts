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
  | {
      success: true;
      /** Canvas node id, ou null pour une URL hors canvas. */
      nodeId: string | null;
      images: Array<{ url: string; name: string | null }>;
      total: number;
    }
  | { success: false; message: string };

export default function viewImageTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Look at one or more images yourself, instead of relying on their indexed text description. " +
      "Pass `nodeId` for an image node of the current canvas (preferred: short, and it reads the node's current images), " +
      "or `url` for an image that is not on the canvas (a web search result, a page you opened). " +
      `Exactly one of the two. At most ${MAX_VIEW_IMAGES} images are returned, from "offset" on; "total" says how many the node holds.`,
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
      offset: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "For nodeId only: index of the first image to show (default 0). " +
            "When the node holds more images than returned, re-call with a higher offset for the rest.",
        ),
    }),
    execute: async (ctx, input): Promise<ViewImageOutput> => {
      const hasNodeId = typeof input.nodeId === "string" && input.nodeId !== "";
      const hasUrl = typeof input.url === "string" && input.url !== "";
      const offset = Math.max(Math.trunc(input.offset ?? 0), 0);

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
        return {
          success: true,
          nodeId: null,
          images: [{ url: toModelImageUrl(input.url as string), name: null }],
          total: 1,
        };
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

        const shown = images.slice(offset, offset + MAX_VIEW_IMAGES);
        console.log(
          `🖼️ Routing ${shown.length} image(s) of node ${nodeId} to model (offset ${offset}, total ${images.length})`,
        );
        return {
          success: true,
          nodeId,
          images: shown.map((image) => ({
            url: toModelImageUrl(image.url),
            name:
              typeof image.filename === "string" && image.filename.length > 0
                ? image.filename
                : null,
          })),
          total: images.length,
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
      // Une ligne d'ancrage devant les pixels, sinon le modèle reçoit des
      // images nues sans savoir laquelle est laquelle — ni s'il en manque.
      const shown = output.images.length;
      const subject =
        output.nodeId !== null
          ? `Images of node ${output.nodeId} (${shown} of ${output.total})`
          : "Image from URL";
      const anchor =
        subject +
        output.images
          .map((image, index) => `\n${index + 1}. ${image.name ?? "image"}`)
          .join("") +
        (output.total > shown
          ? `\nShowing ${shown} of ${output.total} — re-call with a higher offset for the rest.`
          : "");
      return {
        type: "content",
        value: [
          { type: "text" as const, text: anchor },
          ...output.images.map((image) => ({
            type: "image-url" as const,
            url: image.url,
          })),
        ],
      };
    },
  });
}
