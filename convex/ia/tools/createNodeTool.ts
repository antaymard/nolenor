import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { generateLlmId } from "../../lib/llmId";
import { markdownToPlateJson } from "../helpers/plateMarkdownConverter";
import { stringifyPlateDocumentForStorage } from "../../lib/plateDocumentStorage";
import {
  getDefaultNodeDataValues,
  nodeDataConfig,
  nodeTypeZodValidator,
} from "../../config/nodeConfig";
import {
  getClosestHandlesForDirectedEdge,
  type NodeRect,
  ToolConfig,
  toolError,
} from "./toolHelpers";

// Tool compaction config
export const createNodeToolConfig: ToolConfig = {
  name: "create_node",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
};

const nodeColorValues = [
  "blue",
  "green",
  "red",
  "yellow",
  "purple",
  "transparent",
  "pink",
  "orange",
  "default",
] as const;

async function applyNodeDataTitle({
  nodeType,
  defaultValues,
  nodeTitle,
}: {
  nodeType: z.infer<typeof nodeTypeZodValidator>;
  defaultValues: Record<string, unknown>;
  nodeTitle?: string;
}): Promise<{ values: Record<string, unknown>; titleApplied: boolean }> {
  const title = nodeTitle?.trim();
  if (!title) {
    return { values: defaultValues, titleApplied: false };
  }

  switch (nodeType) {
    case "document": {
      return {
        values: {
          ...defaultValues,
          doc: stringifyPlateDocumentForStorage(
            await markdownToPlateJson(`# ${title}`),
          ),
        },
        titleApplied: true,
      };
    }

    case "link": {
      const link =
        typeof defaultValues.link === "object" && defaultValues.link !== null
          ? (defaultValues.link as Record<string, unknown>)
          : {};

      return {
        values: {
          ...defaultValues,
          link: {
            ...link,
            pageTitle: title,
          },
        },
        titleApplied: true,
      };
    }

    case "embed": {
      const embed =
        typeof defaultValues.embed === "object" && defaultValues.embed !== null
          ? (defaultValues.embed as Record<string, unknown>)
          : {};

      return {
        values: {
          ...defaultValues,
          embed: {
            ...embed,
            title,
          },
        },
        titleApplied: true,
      };
    }

    case "value": {
      const value =
        typeof defaultValues.value === "object" && defaultValues.value !== null
          ? (defaultValues.value as Record<string, unknown>)
          : {};

      return {
        values: {
          ...defaultValues,
          value: {
            ...value,
            label: title,
          },
        },
        titleApplied: true,
      };
    }

    case "title": {
      return {
        values: {
          ...defaultValues,
          text: title,
        },
        titleApplied: true,
      };
    }

    case "table": {
      return {
        values: {
          ...defaultValues,
          title,
        },
        titleApplied: true,
      };
    }

    default:
      return { values: defaultValues, titleApplied: false };
  }
}

export default function createNodeTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Create an empty node you can then populate with data or manipulate using other tools.",
    inputSchema: z.object({
      nodeType: nodeTypeZodValidator.describe("Type of the node."),
      explanation: z
        .string()
        .describe("3-5 words explaining the research intent."),
      position: z
        .object({
          x: z.number(),
          y: z.number(),
        })
        .describe("Position x/y of the node on the canvas."),
      color: z.enum(nodeColorValues).describe("Color of the node."),
      dimensions: z
        .object({
          width: z.number(),
          height: z.number(),
        })
        .optional()
        .describe(
          "Dimensions width/height of the node. Default values will be used if not provided.",
        ),
      nodeTitle: z
        .string()
        .optional()
        .describe(
          "Optional node data title. Applied to title-like fields depending on node type.",
        ),
      sourceNodes: z
        .array(z.string())
        .optional()
        .describe(
          "Optional list of existing nodeIds to connect FROM each source node TO the newly created node.",
        ),
    }),
    execute: async (ctx, input) => {
      try {
        const nodeConfig = nodeDataConfig.find(
          (item) => item.type === input.nodeType,
        );
        if (!nodeConfig) {
          return toolError(`Unsupported nodeType ${input.nodeType}.`);
        }

        const defaultValues = getDefaultNodeDataValues(input.nodeType);
        if (!defaultValues) {
          return toolError(`Unsupported nodeType ${input.nodeType}.`);
        }

        if (typeof defaultValues !== "object" || defaultValues === null) {
          return toolError(
            `Invalid default values for nodeType ${input.nodeType}.`,
          );
        }

        const defaultValuesRecord = defaultValues as Record<string, unknown>;

        const resolvedDimensions =
          input.dimensions ?? nodeConfig.defaultDimensions;

        const { values: initialValues, titleApplied } =
          await applyNodeDataTitle({
            nodeType: input.nodeType,
            defaultValues: defaultValuesRecord,
            nodeTitle: input.nodeTitle,
          });

        const nodeDataId = await ctx.runMutation(
          internal.wrappers.nodeDataWrappers.create,
          {
            type: input.nodeType,
            values: initialValues,
            canvasId,
          },
        );

        const nodeId = generateLlmId();

        await ctx.runMutation(internal.wrappers.canvasNodeWrappers.add, {
          canvasId,
          canvasNodes: [
            {
              id: nodeId,
              nodeDataId,
              type: input.nodeType,
              position: input.position,
              width: resolvedDimensions.width,
              height: resolvedDimensions.height,
              color: input.color,
            },
          ],
        });

        const createdEdges: Array<{
          id: string;
          source: string;
          target: string;
          sourceHandle: string;
          targetHandle: string;
        }> = [];

        if (input.sourceNodes && input.sourceNodes.length > 0) {
          const toRect: NodeRect = {
            id: nodeId,
            position: input.position,
            width: resolvedDimensions.width,
            height: resolvedDimensions.height,
          };

          for (const sourceNodeId of input.sourceNodes) {
            if (sourceNodeId === nodeId) {
              return toolError(
                "sourceNodes cannot contain the newly created node itself.",
              );
            }

            const fromNodeLookup = await ctx.runQuery(
              internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
              {
                canvasId,
                nodeId: sourceNodeId,
              },
            );

            const fromRect: NodeRect = {
              id: fromNodeLookup.node.id,
              position: fromNodeLookup.node.position,
              width: fromNodeLookup.node.width,
              height: fromNodeLookup.node.height,
            };

            const { sourceHandle, targetHandle } =
              getClosestHandlesForDirectedEdge({
                from: fromRect,
                to: toRect,
              });

            const edgeId = generateLlmId();

            await ctx.runMutation(internal.wrappers.canvasEdgeWrappers.add, {
              canvasId,
              edges: [
                {
                  id: edgeId,
                  source: sourceNodeId,
                  target: nodeId,
                  sourceHandle,
                  targetHandle,
                },
              ],
            });

            createdEdges.push({
              id: edgeId,
              source: sourceNodeId,
              target: nodeId,
              sourceHandle,
              targetHandle,
            });
          }
        }

        const currentNodeData =
          input.nodeType === "document"
            ? {
                doc: input.nodeTitle?.trim()
                  ? `# ${input.nodeTitle.trim()}`
                  : "",
              }
            : initialValues;

        const titleHint =
          input.nodeType === "document" &&
          titleApplied &&
          input.nodeTitle?.trim()
            ? `The title is already present in the document as "# ${input.nodeTitle.trim()}". Do not repeat it during later edits.`
            : undefined;

        const canvas = await ctx.runQuery(
          internal.wrappers.canvasWrappers.read,
          {
            canvasId,
          },
        );

        return {
          success: true,
          canvasName: canvas.name,
          nodeId,
          nodeType: input.nodeType,
          ...(titleHint ? { hint: titleHint } : { titleApplied }),
          position: input.position,
          color: input.color,
          dimensions: {
            width: resolvedDimensions.width,
            height: resolvedDimensions.height,
          },
          currentNodeData,
        };
      } catch (error) {
        return toolError(
          `Error while creating node: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
}
