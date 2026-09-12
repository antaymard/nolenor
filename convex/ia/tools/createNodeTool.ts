import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import { getDefaultValuesForTemplate } from "../../config/fieldConfig";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import {
  generateBlockId,
  stringifyBlockNoteDocumentForStorage,
} from "../../lib/blockNoteDocument";
import {
  agentCreatableNodeTypeZodValidator,
  getDefaultNodeDataValues,
  nodeDataConfig,
  nodeTypeZodValidator,
} from "../../config/nodeConfig";
import {
  EXPLANATION_FIELD,
  getClosestHandlesForDirectedEdge,
  type NodeRect,
  type ToolConfig,
  toolError,
} from "./toolHelpers";
import {
  contentAnchor,
  resolveRelativePlacement,
  type PlacementRequest,
  type PlacementSide,
} from "../helpers/nodePlacement";

// Tool compaction config
export const createNodeToolConfig: ToolConfig = {
  name: "create_node",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.worker,
  ],
  mcp: { access: "write" },
};

/** Retour du placement au modèle : ce qui a été demandé, ce qui a été appliqué. */
type PlacementReport = {
  requested: PlacementRequest | "absolute";
  applied: PlacementSide | "scan" | "origin" | "absolute";
  anchorNodeId?: string;
  fallback?: "empty_canvas" | "anchor_not_found" | "no_anchor";
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
    case "blocknote": {
      // Le bloc heading est construit à la main plutôt que via
      // `markdownToBlockNoteBlocks` : ce dernier passe par le runtime jsdom
      // headless et son verrou global de process, disproportionné pour un
      // titre. La forme produite est celle que `getNodeDataTitle` relit.
      return {
        values: {
          ...defaultValues,
          doc: stringifyBlockNoteDocumentForStorage([
            {
              id: generateBlockId(),
              type: "heading",
              props: { level: 1 },
              content: [{ type: "text", text: title, styles: {} }],
            },
          ]),
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
      "Create an empty node you can then populate with data or manipulate using other tools. Default dimensions of the node type (or template) are applied automatically. By default the node is placed relative to an anchor (anchorNodeId/placement) without overlapping existing nodes; pass position only for exact absolute placement.",
    inputSchema: z.object({
      // Enum restreint aux types exposés : `viewport` et consorts ne sont ni
      // listés dans le schema, ni acceptés en entrée.
      nodeType:
        agentCreatableNodeTypeZodValidator.describe("Type of the node."),
      templateId: z
        .string()
        .optional()
        .describe(
          'Required when nodeType is "custom": the node template id (see <user_node_templates>). Ignored otherwise.',
        ),
      explanation: EXPLANATION_FIELD,
      anchorNodeId: z
        .string()
        .optional()
        .describe(
          "Optional anchor node id for relative placement. Defaults to the last valid entry of sourceNodes, then to the edge of the existing content. Ignored when position is provided.",
        ),
      placement: z
        .enum(["left", "right", "above", "below", "auto"])
        .optional()
        .describe(
          'Where to place the node relative to the anchor. Default "auto": first free spot among right, below, left, above. Existing nodes are never overlapped — a nearby free spot is found instead. Ignored when position is provided.',
        ),
      position: z
        .object({
          x: z.number(),
          y: z.number(),
        })
        .optional()
        .describe(
          "Optional absolute canvas position, used exactly as given even if it overlaps existing nodes. Prefer anchorNodeId/placement for automatic non-overlapping placement.",
        ),
      color: z.enum(nodeColorValues).describe("Color of the node."),
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
          "Optional list of existing nodeIds to connect FROM each source node TO the newly created node. Unknown or invalid ids are skipped and reported in skippedSources. Its last valid entry is the default anchor for relative placement.",
        ),
    }),
    execute: async (ctx, input) => {
      try {
        // ── Custom nodes : défauts, dimensions et titre viennent du
        // template (values keyées par fieldId), pas de nodeConfig — le
        // lookup nodeDataConfig reste donc dans la branche non-custom.
        // Les dimensions ne sont pas un arg agent : on applique toujours
        // les dimensions par défaut du type ou du template. ──
        let template: Doc<"nodeTemplates"> | null = null;
        let initialValues: Record<string, unknown>;
        let titleApplied = false;
        let defaultDimensions: { width: number; height: number };

        if (input.nodeType === "custom") {
          if (!input.templateId) {
            return toolError(
              'templateId is required when nodeType is "custom". Pick one from <user_node_templates>.',
            );
          }
          try {
            template = await ctx.runQuery(
              internal.wrappers.nodeTemplateWrappers.getTemplate,
              { templateId: input.templateId as Id<"nodeTemplates"> },
            );
          } catch {
            template = null;
          }
          if (!template) {
            return toolError(
              `Unknown templateId "${input.templateId}". Pick one from <user_node_templates>.`,
            );
          }
          if (template.creatorId !== threadCtx.authUserId) {
            return toolError(
              "This template belongs to another user and cannot be instantiated here.",
            );
          }
          if (template.archivedAt !== undefined) {
            return toolError(
              `Template "${template.name}" is archived. Ask the user to restore it before creating nodes from it.`,
            );
          }

          initialValues = getDefaultValuesForTemplate(template);
          const title = input.nodeTitle?.trim();
          if (title && template.titleFieldId) {
            initialValues[template.titleFieldId] = title;
            titleApplied = true;
          }
          defaultDimensions = template.defaultDimensions;
        } else {
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

          defaultDimensions = nodeConfig.defaultDimensions;

          const titled = await applyNodeDataTitle({
            nodeType: input.nodeType,
            defaultValues: defaultValuesRecord,
            nodeTitle: input.nodeTitle,
          });
          initialValues = titled.values;
          titleApplied = titled.titleApplied;
        }

        // ── Placement ──
        // `position` absolu = strict : posé tel quel, même s'il overlappe
        // (prévisibilité MCP, position attachée par l'utilisateur). Sinon
        // placement relatif sans overlap : ancre explicite, sinon dernière
        // source valide, sinon bord du contenu existant.
        let finalPosition: { x: number; y: number };
        let placementReport: PlacementReport;
        let nodeRectsById: Map<string, NodeRect> | null = null;

        if (input.position) {
          finalPosition = input.position;
          placementReport = { requested: "absolute", applied: "absolute" };
        } else {
          const { nodes } = await ctx.runQuery(
            internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
            {
              canvasId,
            },
          );
          const nodeRects: NodeRect[] = nodes.map((node) => ({
            id: node.id,
            position: node.position,
            width: node.width,
            height: node.height,
          }));
          nodeRectsById = new Map(nodeRects.map((rect) => [rect.id, rect]));

          const requestedPlacement = input.placement ?? "auto";

          if (nodeRects.length === 0) {
            finalPosition = { x: 0, y: 0 };
            placementReport = {
              requested: requestedPlacement,
              applied: "origin",
              fallback: "empty_canvas",
            };
          } else {
            let anchor: NodeRect | null = null;
            let anchorFallback: PlacementReport["fallback"];

            if (input.anchorNodeId) {
              anchor = nodeRectsById.get(input.anchorNodeId) ?? null;
              if (!anchor) {
                anchorFallback = "anchor_not_found";
              }
            }
            if (!anchor && input.sourceNodes && input.sourceNodes.length > 0) {
              for (const sourceNodeId of input.sourceNodes) {
                const found = nodeRectsById.get(sourceNodeId);
                if (found) {
                  anchor = found;
                }
              }
            }

            const anchorRect = anchor ?? contentAnchor(nodeRects)!;
            const { x, y, applied } = resolveRelativePlacement({
              anchor: anchorRect,
              size: defaultDimensions,
              placement: requestedPlacement,
              obstacles: nodeRects,
            });
            finalPosition = { x, y };
            placementReport = {
              requested: requestedPlacement,
              applied,
              ...(anchor
                ? { anchorNodeId: anchor.id }
                : { fallback: anchorFallback ?? "no_anchor" }),
            };
          }
        }

        const [created] = await ctx.runMutation(
          internal.wrappers.nodeWrappers.createWithNodeData,
          {
            nodes: [
              {
                node: {
                  canvasId,
                  type: input.nodeType,
                  position: finalPosition,
                  width: defaultDimensions.width,
                  height: defaultDimensions.height,
                  ...(input.color && { color: input.color }),
                  ...(template && { data: { templateId: template._id } }),
                },
                nodeDataValues: initialValues,
                ...(template && { nodeDataTemplateId: template._id }),
              },
            ],
            actor: {
              type: "agent",
              userId: threadCtx.authUserId,
              threadId: ctx.threadId,
            },
          },
        );
        const nodeId = created.nodeId;

        // Connexions demandées depuis des sources existantes, isolées par
        // source : le node est déjà commité, une source invalide ne doit pas
        // faire échouer le tool entier (« error » pour un node qui existe).
        // Les skippées sont rapportées avec leur raison — l'agent retente
        // via create_connection avec le bon id.
        const connectedSources: Array<{
          sourceNodeId: string;
          edgeId: string;
        }> = [];
        const skippedSources: Array<{ sourceNodeId: string; reason: string }> =
          [];

        if (input.sourceNodes && input.sourceNodes.length > 0) {
          // Fetch partagé avec le placement relatif : en placement absolu,
          // le batch n'a pas encore été lu.
          if (!nodeRectsById) {
            const { nodes } = await ctx.runQuery(
              internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
              {
                canvasId,
              },
            );
            nodeRectsById = new Map(
              nodes.map((node) => [
                node.id,
                {
                  id: node.id,
                  position: node.position,
                  width: node.width,
                  height: node.height,
                },
              ]),
            );
          }

          const toRect: NodeRect = {
            id: nodeId,
            position: finalPosition,
            width: defaultDimensions.width,
            height: defaultDimensions.height,
          };

          for (const sourceNodeId of input.sourceNodes) {
            if (sourceNodeId === nodeId) {
              skippedSources.push({
                sourceNodeId,
                reason:
                  "sourceNodes cannot contain the newly created node itself.",
              });
              continue;
            }

            const fromRect = nodeRectsById.get(sourceNodeId);
            if (!fromRect) {
              skippedSources.push({
                sourceNodeId,
                reason: "source node not found on this canvas",
              });
              continue;
            }

            try {
              const { sourceHandle, targetHandle } =
                getClosestHandlesForDirectedEdge({
                  from: fromRect,
                  to: toRect,
                });

              // Id serveur via `edgeWrappers.create` : le node vient d'être
              // commit par `createWithNodeData`, la validation des endpoints
              // passe.
              const [edgeId] = await ctx.runMutation(
                internal.wrappers.edgeWrappers.create,
                {
                  edges: [
                    {
                      canvasId,
                      source: sourceNodeId,
                      target: nodeId,
                      sourceHandle,
                      targetHandle,
                    },
                  ],
                },
              );

              connectedSources.push({ sourceNodeId, edgeId });
            } catch (error) {
              skippedSources.push({
                sourceNodeId,
                reason:
                  error instanceof Error
                    ? error.message
                    : "connection failed",
              });
            }
          }
        }

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
          titleApplied,
          position: finalPosition,
          placement: placementReport,
          color: input.color,
          dimensions: {
            width: defaultDimensions.width,
            height: defaultDimensions.height,
          },
          currentNodeData: initialValues,
          // Connexions depuis les sources demandées : les réussies avec
          // leur edgeId, les skippées avec leur raison.
          ...(input.sourceNodes &&
            input.sourceNodes.length > 0 && {
              connectedSources,
              ...(skippedSources.length > 0 && { skippedSources }),
            }),
          // Custom : la carte des champs (id ↔ nom ↔ type) — les values de
          // set_node_data doivent être keyées par field id.
          ...(template && {
            templateName: template.name,
            templateFields: template.fields.map((f) => ({
              id: f.id,
              name: f.name,
              type: f.type,
            })),
          }),
        };
      } catch (error) {
        return toolError(
          `Error while creating node: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
}
