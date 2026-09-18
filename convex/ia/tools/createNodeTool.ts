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
import { absolutePositionsById } from "../../lib/nodeGeometry";
import { FRAME_CONTENT_PADDING } from "../../config/nodeConfig";

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
  applied: PlacementSide | "scan" | "origin" | "absolute" | "bounded";
  anchorNodeId?: string;
  /** La frame dans laquelle le node a été posé, si `frameId` a été demandé. */
  frameId?: string;
  /** La frame a dû s'agrandir pour contenir le node : sa nouvelle taille. */
  frameGrown?: { width: number; height: number };
  fallback?:
    | "empty_canvas"
    | "anchor_not_found"
    | "no_anchor"
    | "empty_frame"
    | "anchor_outside_frame";
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
      frameId: z
        .string()
        .optional()
        .describe(
          "Optional frame node id: create the node INSIDE that frame, as one of its children. The frame must already exist — see the canvas structure map, list_nodes, or create one with group_nodes. Placement then happens inside the frame's box, and the frame grows if the node does not fit. What enters a frame stays there: you cannot take it out afterwards, and deleting the frame deletes it. Only use this when the node belongs to that group.",
        ),
      anchorNodeId: z
        .string()
        .optional()
        .describe(
          "Optional anchor node id for relative placement. Defaults to the last valid entry of sourceNodes, then to the edge of the existing content. With frameId, the anchor must be a node of that frame, and the frame's existing content is used otherwise — sourceNodes does not anchor in that case, since a source usually sits outside. Ignored when position is provided.",
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
        /** Le rectangle MONDE de la frame cible, quand `frameId` est demandé. */
        let frameRect: NodeRect | null = null;

        // Le fetch était sauté en placement absolu ; avec `frameId` le
        // rectangle de la frame est nécessaire dans les deux cas — c'est lui
        // qui donne le repère dans lequel écrire la position.
        if (input.position && !input.frameId) {
          finalPosition = input.position;
          placementReport = { requested: "absolute", applied: "absolute" };
        } else {
          const { nodes } = await ctx.runQuery(
            internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
            {
              canvasId,
            },
          );
          // Positions MONDE : un node qui vit dans une frame porte une
          // position relative à elle. Sans conversion, le placement le verrait
          // à quelques dizaines de pixels de l'origine et poserait le nouveau
          // node par-dessus ce qui s'y trouve.
          const worldPositions = absolutePositionsById(nodes);
          const nodeRects: NodeRect[] = nodes.map((node) => ({
            id: node.id,
            position: worldPositions.get(node.id) ?? node.position,
            width: node.width,
            height: node.height,
          }));
          nodeRectsById = new Map(nodeRects.map((rect) => [rect.id, rect]));

          if (input.frameId) {
            const frameNode = nodes.find((node) => node.id === input.frameId);
            if (!frameNode) {
              return toolError(
                `Unknown frameId "${input.frameId}": no node with this id on this canvas.`,
              );
            }
            if (frameNode.type !== "frame") {
              return toolError(
                `Node ${input.frameId} is a ${frameNode.type}, not a frame. Only a frame can contain nodes.`,
              );
            }
            frameRect = nodeRectsById.get(frameNode.id) ?? null;
          }

          const requestedPlacement = input.placement ?? "auto";

          // La zone utile de la frame : sa boîte moins la marge. C'est là que
          // le node doit tomber, et le plancher à 0 évite une région négative
          // sur une frame plus petite que deux marges.
          const bounds: NodeRect | null = frameRect
            ? {
                id: frameRect.id,
                position: {
                  x: frameRect.position.x + FRAME_CONTENT_PADDING,
                  y: frameRect.position.y + FRAME_CONTENT_PADDING,
                },
                width: Math.max(
                  0,
                  frameRect.width - 2 * FRAME_CONTENT_PADDING,
                ),
                height: Math.max(
                  0,
                  frameRect.height - 2 * FRAME_CONTENT_PADDING,
                ),
              }
            : null;

          // Les enfants de la frame cible : ce sont eux qu'il s'agit de ne pas
          // recouvrir, et c'est leur boîte englobante qui sert d'ancre.
          const frameChildren = frameRect
            ? nodes
                .filter((node) => node.parentId === frameRect!.id)
                .flatMap((node) => {
                  const rect = nodeRectsById!.get(node.id);
                  return rect ? [rect] : [];
                })
            : [];

          if (input.position && bounds && frameRect) {
            // Position absolue DANS une frame : on la prend telle quelle, comme
            // hors frame — « used exactly as given even if it overlaps ». Seule
            // la conversion de repère plus bas s'applique.
            finalPosition = input.position;
            placementReport = {
              requested: "absolute",
              applied: "absolute",
              frameId: frameRect.id,
            };
          } else if (bounds && frameRect && frameChildren.length === 0) {
            // Frame vide : le coin intérieur, directement. Passer par les
            // candidats latéraux d'une ancre de taille nulle les ferait tous
            // sortir de la boîte, et le scan en anneaux finirait par poser le
            // node décalé pour rien.
            finalPosition = { ...bounds.position };
            placementReport = {
              requested: requestedPlacement,
              applied: "origin",
              frameId: frameRect.id,
              fallback: "empty_frame",
            };
          } else if (nodeRects.length === 0) {
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
              const requested = nodeRectsById.get(input.anchorNodeId) ?? null;
              if (!requested) {
                anchorFallback = "anchor_not_found";
              } else if (frameRect) {
                // Une ancre hors de la frame placerait le node hors de la
                // boîte : on retombe sur le contenu de la frame.
                const isChild = frameChildren.some(
                  (child) => child.id === requested.id,
                );
                if (isChild) anchor = requested;
                else anchorFallback = "anchor_outside_frame";
              } else {
                anchor = requested;
              }
            }
            // `sourceNodes` n'ancre pas en mode frame : une source est en
            // général dehors, et ancrer dessus viserait hors de la boîte.
            if (
              !anchor &&
              !frameRect &&
              input.sourceNodes &&
              input.sourceNodes.length > 0
            ) {
              for (const sourceNodeId of input.sourceNodes) {
                const found = nodeRectsById.get(sourceNodeId);
                if (found) {
                  anchor = found;
                }
              }
            }

            // Hors frame : le bord du contenu du canvas. Dans une frame : le
            // bord de SON contenu — la même sémantique, un cran plus bas.
            const anchorRect =
              anchor ??
              (frameRect
                ? (contentAnchor(frameChildren) ?? {
                    id: frameRect.id,
                    position: bounds!.position,
                    width: 0,
                    height: 0,
                  })
                : contentAnchor(nodeRects)!);

            // La frame cible sort de ses propres obstacles : son rectangle
            // recouvre par construction tout ce qu'on voudrait poser dedans, et
            // aucun candidat ne pourrait satisfaire « dans la frame » ET « sans
            // chevauchement ». Les autres frames restent des obstacles — on ne
            // pose pas un node sur un autre groupe.
            const obstacles = frameRect
              ? nodeRects.filter((rect) => rect.id !== frameRect!.id)
              : nodeRects;

            const { x, y, applied } = resolveRelativePlacement({
              anchor: anchorRect,
              size: defaultDimensions,
              placement: requestedPlacement,
              obstacles,
              ...(bounds && { bounds }),
            });
            finalPosition = { x, y };
            placementReport = {
              requested: requestedPlacement,
              applied,
              ...(frameRect && { frameId: frameRect.id }),
              ...(anchor
                ? { anchorNodeId: anchor.id }
                : { fallback: anchorFallback ?? "no_anchor" }),
            };
          }
        }

        const actor = {
          type: "agent" as const,
          userId: threadCtx.authUserId,
          threadId: ctx.threadId,
        };
        const nodeShape = {
          type: input.nodeType,
          width: defaultDimensions.width,
          height: defaultDimensions.height,
          ...(input.color && { color: input.color }),
          ...(template && { data: { templateId: template._id } }),
        };

        let nodeId: string;
        if (frameRect) {
          // La seule conversion de repère du tool. `finalPosition` reste en
          // MONDE partout au-dessus — la géométrie des `sourceNodes` en dépend —
          // et ne devient relative qu'ici, au moment d'écrire. Une frame est
          // toujours de premier niveau, donc sa position EST sa position monde :
          // pas de récursion. Pendant serveur de `positionInFrame`.
          const relativePosition = {
            x: finalPosition.x - frameRect.position.x,
            y: finalPosition.y - frameRect.position.y,
          };
          const created = await ctx.runMutation(
            internal.wrappers.nodeWrappers.createInFrame,
            {
              canvasId,
              frameId: frameRect.id,
              node: { canvasId, position: relativePosition, ...nodeShape },
              nodeDataValues: initialValues,
              ...(template && { nodeDataTemplateId: template._id }),
              actor,
            },
          );
          nodeId = created.nodeId;
          if (created.frame.grown) {
            placementReport = {
              ...placementReport,
              frameGrown: {
                width: created.frame.width,
                height: created.frame.height,
              },
            };
          }
        } else {
          const [created] = await ctx.runMutation(
            internal.wrappers.nodeWrappers.createWithNodeData,
            {
              nodes: [
                {
                  node: { canvasId, position: finalPosition, ...nodeShape },
                  nodeDataValues: initialValues,
                  ...(template && { nodeDataTemplateId: template._id }),
                },
              ],
              actor,
            },
          );
          nodeId = created.nodeId;
        }

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
            // Positions MONDE, comme dans la branche du placement relatif :
            // une source qui vit dans une frame porte une position relative, et
            // les poignées d'edge se calculeraient sur un rectangle fantôme
            // posé près de l'origine.
            const worldPositions = absolutePositionsById(nodes);
            nodeRectsById = new Map(
              nodes.map((node) => [
                node.id,
                {
                  id: node.id,
                  position: worldPositions.get(node.id) ?? node.position,
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
          // Position MONDE, comme `list_nodes` et `read_nodes` la rendent — y
          // compris pour un node posé dans une frame, dont la position écrite
          // en base est pourtant relative.
          position: finalPosition,
          ...(frameRect && { frameId: frameRect.id }),
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
