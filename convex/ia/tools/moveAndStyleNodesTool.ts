import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import {
  FRAME_CONTENT_PADDING,
  getNodeCapabilities,
  nodeDataConfig,
} from "../../config/nodeConfig";
import { NODE_COLORS } from "../../config/colorsConfig";
import { absolutePositionsById } from "../../lib/nodeGeometry";
import { resolveRelativePlacement } from "../helpers/nodePlacement";
import {
  EXPLANATION_FIELD,
  type NodeRect,
  type ToolConfig,
  toolError,
} from "./toolHelpers";

const MAX_UPDATES = 30;

export const moveAndStyleNodesToolConfig: ToolConfig = {
  name: "move_and_style_nodes",
  deferred: true,
  authorized_agents: [toolAgentNames.nole, toolAgentNames.worker],
  mcp: { access: "write" },
};

/**
 * Les variantes de chaque type, telles que le modèle doit les écrire : la clé
 * stockée, suivie du libellé de l'interface quand il diffère (« default »
 * s'appelle « Carousel » pour une image, « Preview » pour un document).
 */
const VARIANTS_FOR_PROMPT = nodeDataConfig
  .filter(
    (item) =>
      item.variants !== undefined &&
      getNodeCapabilities(item.type).agent.readable,
  )
  .map(
    (item) =>
      `${item.type}: ${Object.entries(item.variants!)
        .map(([key, variant]) =>
          variant.label.toLowerCase() === key
            ? key
            : `${key} ("${variant.label}")`,
        )
        .join(", ")}`,
  )
  .join("; ");

/** Les dimensions qu'aura le node, variante demandée comprise. */
function sizeAfterVariant(
  node: { type: string; width: number; height: number },
  variantKey: string | undefined,
): { width: number; height: number } {
  if (variantKey === undefined) return node;
  const variant = nodeDataConfig.find((item) => item.type === node.type)
    ?.variants?.[variantKey];
  if (!variant || variant.preservesStoredSize === true) return node;
  return { width: variant.defaultWidth, height: variant.defaultHeight };
}

/**
 * Déplacer des nodes, changer leur couleur, leur variante d'affichage.
 *
 * Le pendant de ce que l'utilisateur fait au glisser et au clic droit
 * (Color, Appearance). Le placement relatif (`anchorNodeId` + `placement`) est
 * celui de `create_node`, sans recouvrement ; la position absolue est prise
 * telle quelle. Les règles d'écriture — dimensions de variante, bande de plan
 * d'une frame compacte, frame qui grandit, verrou — vivent dans
 * `NodeModels.updateNodesLayout`, pas ici.
 *
 * Ne touche ni au contenu (`set_node_data` et les tools de blocs) ni à
 * l'appartenance à une frame : un node déplacé reste dans sa frame, et une
 * frame déplacée emmène son contenu.
 */
export default function moveAndStyleNodesTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description: `Move existing nodes, and/or change their color or display variant. Does not touch their content (use set_node_data and the block/table tools for that). Moving a frame moves everything inside it. A node inside a frame stays in it: it can be moved within the frame (the frame grows to the right/bottom if needed), never out of it. Nodes locked by the user cannot be moved. Changing the variant resets the node to that variant's default size. Available variants per node type — ${VARIANTS_FOR_PROMPT}. Other types have no variants. All updates are applied together, or none if one is invalid.`,
    inputSchema: z.object({
      explanation: EXPLANATION_FIELD,
      updates: z
        .array(
          z.object({
            nodeId: z.string().describe("Id of the node to change."),
            anchorNodeId: z
              .string()
              .optional()
              .describe(
                "Move the node next to this anchor node, without overlapping other nodes (preferred way to move). For a node inside a frame, the anchor must be in the same frame.",
              ),
            placement: z
              .enum(["left", "right", "above", "below", "auto"])
              .optional()
              .describe(
                'Side of the anchor to move to. Default "auto": first free spot among right, below, left, above. Only with anchorNodeId.',
              ),
            position: z
              .object({ x: z.number(), y: z.number() })
              .optional()
              .describe(
                "Exact top-left position in world coordinates (the ones list_nodes and the canvas map show, even for a node inside a frame), used as given even if it overlaps. Use only when the user gave a position or for a precise layout; not together with anchorNodeId.",
              ),
            color: z.enum(NODE_COLORS).optional().describe("New color."),
            variant: z
              .string()
              .optional()
              .describe(
                "New display variant key, among those listed for the node's type.",
              ),
          }),
        )
        .min(1)
        .max(MAX_UPDATES)
        .describe(
          "One entry per node, each with at least one change. Entries are placed in order: a node moved by an earlier entry is already at its new spot for the next ones.",
        ),
    }),
    execute: async (ctx, input) => {
      try {
        const { nodes } = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
          { canvasId },
        );
        const byId = new Map(nodes.map((node) => [node.id, node]));

        // Les types que l'agent ne voit pas sont inconnus, comme partout.
        const isVisible = (nodeId: string) => {
          const node = byId.get(nodeId);
          return node !== undefined && getNodeCapabilities(node.type).agent.readable;
        };
        const unknown = [
          ...new Set(
            input.updates.flatMap((update) => [
              update.nodeId,
              ...(update.anchorNodeId ? [update.anchorNodeId] : []),
            ]),
          ),
        ].filter((nodeId) => !isVisible(nodeId));
        if (unknown.length > 0) {
          return toolError(
            `No node with this id on this canvas: ${unknown.join(", ")}. Nothing was changed.`,
          );
        }

        for (const update of input.updates) {
          if (
            update.position === undefined &&
            update.anchorNodeId === undefined &&
            update.color === undefined &&
            update.variant === undefined
          ) {
            return toolError(
              `Nothing to change for node ${update.nodeId}: give anchorNodeId, position, color or variant. Nothing was changed.`,
            );
          }
          if (update.position && update.anchorNodeId) {
            return toolError(
              `Node ${update.nodeId}: give either position or anchorNodeId, not both. Nothing was changed.`,
            );
          }
          if (update.placement && !update.anchorNodeId) {
            return toolError(
              `Node ${update.nodeId}: placement needs an anchorNodeId. Nothing was changed.`,
            );
          }
        }

        // Rectangles MONDE, tenus à jour au fil des entrées : un node déplacé
        // plus haut dans la liste est un obstacle à sa nouvelle place, pas à
        // l'ancienne.
        const worldPositions = absolutePositionsById(nodes);
        const rects = new Map<string, NodeRect>(
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

        const updates: Array<{
          nodeId: string;
          position?: { x: number; y: number };
          color?: string;
          variant?: string;
        }> = [];

        for (const update of input.updates) {
          const node = byId.get(update.nodeId)!;
          const size = sizeAfterVariant(node, update.variant);
          let position = update.position;

          if (update.anchorNodeId) {
            if (update.anchorNodeId === node.id) {
              return toolError(
                `Node ${node.id} cannot be its own anchor. Nothing was changed.`,
              );
            }
            const anchorNode = byId.get(update.anchorNodeId)!;
            if (anchorNode.parentId === node.id) {
              return toolError(
                `Node ${anchorNode.id} is inside frame ${node.id}, which moves with it: it cannot anchor it. Nothing was changed.`,
              );
            }
            const frame = node.parentId ? rects.get(node.parentId) : undefined;
            if (frame && anchorNode.parentId !== frame.id) {
              return toolError(
                `Node ${node.id} is inside frame ${frame.id} and cannot leave it: its anchor must be a node of that frame. Nothing was changed.`,
              );
            }

            // Ni le node lui-même, ni ce qu'il emporte (une frame et son
            // contenu), ni la frame qui le contient ne sont des obstacles : la
            // frame recouvre par construction tout ce qu'on veut poser dedans.
            const obstacles = [...rects.values()].filter(
              (rect) =>
                rect.id !== node.id &&
                rect.id !== frame?.id &&
                byId.get(rect.id)?.parentId !== node.id,
            );
            const { x, y } = resolveRelativePlacement({
              anchor: rects.get(anchorNode.id)!,
              size,
              placement: update.placement ?? "auto",
              obstacles,
              ...(frame && {
                bounds: {
                  position: {
                    x: frame.position.x + FRAME_CONTENT_PADDING,
                    y: frame.position.y + FRAME_CONTENT_PADDING,
                  },
                  width: Math.max(0, frame.width - 2 * FRAME_CONTENT_PADDING),
                  height: Math.max(
                    0,
                    frame.height - 2 * FRAME_CONTENT_PADDING,
                  ),
                },
              }),
            });
            position = { x, y };
          }

          if (position) {
            const previous = rects.get(node.id)!;
            const dx = position.x - previous.position.x;
            const dy = position.y - previous.position.y;
            rects.set(node.id, { ...previous, position, ...size });
            // Le contenu d'une frame la suit : ses rectangles aussi.
            if (node.type === "frame") {
              for (const child of nodes) {
                if (child.parentId !== node.id) continue;
                const rect = rects.get(child.id)!;
                rects.set(child.id, {
                  ...rect,
                  position: { x: rect.position.x + dx, y: rect.position.y + dy },
                });
              }
            }
          } else {
            rects.set(node.id, { ...rects.get(node.id)!, ...size });
          }

          updates.push({
            nodeId: node.id,
            ...(position && { position }),
            ...(update.color !== undefined && { color: update.color }),
            ...(update.variant !== undefined && { variant: update.variant }),
          });
        }

        const results = await ctx.runMutation(
          internal.wrappers.nodeWrappers.updateLayout,
          { canvasId, updates },
        );

        console.log(`🎨 Updated layout of ${results.length} node(s)`);

        return {
          success: true,
          nodes: results.map((result) => ({
            nodeId: result.nodeId,
            x: Math.trunc(result.position.x),
            y: Math.trunc(result.position.y),
            width: Math.trunc(result.width),
            height: Math.trunc(result.height),
            ...(result.color !== undefined && { color: result.color }),
            ...(result.variant !== undefined && { variant: result.variant }),
            ...(result.frameGrown && { frameGrown: result.frameGrown }),
          })),
        };
      } catch (error) {
        return toolError(
          `Error while updating nodes: ${error instanceof Error ? error.message : String(error)}. Nothing was changed.`,
        );
      }
    },
  });
}
