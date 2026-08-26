import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { toolAgentNames } from "../agentConfig";
import { EXPLANATION_FIELD, type ToolConfig } from "./toolHelpers";

export const viewImageToolConfig: ToolConfig = {
  name: "view_image",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.worker,
  ],
  requireMultiModal: true,
};

type ViewImageOutput =
  | { success: true; url: string }
  | { success: false; message: string };

export const viewImageTool = createTool({
  description: "See an image from an URL (not a nodeId).",
  inputSchema: z.object({
    explanation: EXPLANATION_FIELD,
    url: z.string().describe("The URL of the image to fetch and view."),
  }),
  execute: async (_ctx, input): Promise<ViewImageOutput> => {
    console.log(`🖼️ Routing image URL to model: ${input.url}`);
    return { success: true, url: input.url };
  },
  toModelOutput: (_ctx, { output }) => {
    if (!output.success) {
      return { type: "error-text", value: output.message };
    }
    return {
      type: "content",
      value: [
        {
          type: "image-url",
          url: output.url,
        },
      ],
    };
  },
});

export default viewImageTool;
