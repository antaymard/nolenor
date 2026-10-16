import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import {
  MAX_BOARD_COLUMNS,
  MAX_BOARD_ROWS,
  boardGridSize,
} from "../../config/boardConfig";
import { getNodeCapabilities } from "../../config/nodeConfig";
import { NODE_COLORS } from "../../config/colorsConfig";
import { absolutePositionsById } from "../../lib/nodeGeometry";
import {
  contentAnchor,
  resolveRelativePlacement,
} from "../helpers/nodePlacement";
import { EXPLANATION_FIELD, type ToolConfig, toolError } from "./toolHelpers";

/**
 * Les tools du board (cf. `convex/config/boardConfig.ts`) : en créer un, et y
 * ranger des nodes ou changer sa grille.
 *
 * Tout-ou-rien, comme `group_nodes` : un id inconnu, un node déjà dans une
 * frame ou un espace qui n'existe pas fait échouer l'appel sans rien écrire.
 * Un rangement partiel donnerait un board faux que l'agent croirait juste.
 */

export const createBoardToolConfig: ToolConfig = {
  name: "create_board",
  deferred: true,
  authorized_agents: [toolAgentNames.nole, toolAgentNames.worker],
  mcp: { access: "write" },
};

export const editBoardToolConfig: ToolConfig = {
  name: "edit_board",
  deferred: true,
  authorized_agents: [toolAgentNames.nole, toolAgentNames.worker],
  mcp: { access: "write" },
};

const columnsField = z
  .number()
  .int()
  .min(1)
  .max(MAX_BOARD_COLUMNS)
  .describe("Number of columns of spaces.");
const rowsField = z
  .number()
  .int()
  .min(1)
  .max(MAX_BOARD_ROWS)
  .describe(
    "Number of rows of spaces. 1 = a Kanban (one space per column); more = a matrix.",
  );

/**
 * Les ids que l'agent n'est pas censé voir sont traités comme inconnus, sans
 * nommer leur type — même règle que `group_nodes`.
 */
async function findInvisibleIds(
  ctx: ActionCtx,
  canvasId: ThreadCtx["canvasId"],
  nodeIds: string[],
): Promise<string[]> {
  const { nodes } = await ctx.runQuery(
    internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
    { canvasId },
  );
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return nodeIds.filter((nodeId) => {
    const node = byId.get(nodeId);
    return node !== undefined && !getNodeCapabilities(node.type).agent.readable;
  });
}

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function createBoardTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Create a board: a container split into spaces, where each node sits in one space, stacked in order and stretched to its width — a Kanban (one row of columns), a 2×2 matrix, a weekly planner. A node's space carries meaning (a card in 'Done' is done). Optionally puts a header title node at the top of the first spaces, and moves existing free nodes into spaces. Returns the space ids, in reading order (row by row): use them with edit_board to place more nodes later. To add a NEW node, create it with create_node, then place it with edit_board.",
    inputSchema: z.object({
      explanation: EXPLANATION_FIELD,
      columns: columnsField.default(3),
      rows: rowsField.default(1),
      titles: z
        .array(z.string())
        .optional()
        .describe(
          "Optional headers, one per space in reading order (row by row). Each becomes a title node at the top of its space; an empty string leaves that space without one.",
        ),
      placements: z
        .array(
          z.object({
            nodeId: z.string(),
            space: z
              .number()
              .int()
              .min(1)
              .describe("1-based index of the space, in reading order."),
          }),
        )
        .optional()
        .describe(
          "Optional existing free nodes (not in a frame or board) to move into the board, in the given order within each space.",
        ),
      color: z.enum(NODE_COLORS).optional().describe("Optional board color."),
    }),
    execute: async (ctx, input) => {
      try {
        const spaceCount = input.columns * input.rows;
        const badSpace = (input.placements ?? []).find(
          (placement) => placement.space > spaceCount,
        );
        if (badSpace) {
          return toolError(
            `Space ${badSpace.space} does not exist: a ${input.columns}×${input.rows} board has ${spaceCount} spaces. Nothing was created.`,
          );
        }
        const nodeIds = (input.placements ?? []).map((p) => p.nodeId);
        const invisible = await findInvisibleIds(ctx, canvasId, nodeIds);
        if (invisible.length > 0) {
          return toolError(
            `No node with this id on this canvas: ${invisible.join(", ")}. Nothing was created.`,
          );
        }

        // Au bord du contenu existant, sans rien recouvrir — comme un node
        // posé par create_node sans ancre.
        const { nodes } = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
          { canvasId },
        );
        const world = absolutePositionsById(nodes);
        const rects = nodes.map((node) => ({
          position: world.get(node.id) ?? node.position,
          width: node.width,
          height: node.height,
        }));
        const anchor = contentAnchor(rects);
        const position = anchor
          ? resolveRelativePlacement({
              anchor,
              size: boardGridSize(input.columns, input.rows),
              placement: "below",
              obstacles: rects,
            })
          : { x: 0, y: 0 };

        const actor = {
          type: "agent" as const,
          userId: threadCtx.authUserId,
          threadId: ctx.threadId,
        };
        // Deux mutations : si le rangement échoue (un node pris entre-temps),
        // le board vide reste, et l'erreur le dit.
        const created = await ctx.runMutation(
          internal.wrappers.boardWrappers.create,
          {
            canvasId,
            position: { x: position.x, y: position.y },
            columns: input.columns,
            rows: input.rows,
            ...(input.titles && { titles: input.titles }),
            ...(input.color && { color: input.color }),
            actor,
          },
        );

        if (input.placements && input.placements.length > 0) {
          try {
            await ctx.runMutation(internal.wrappers.boardWrappers.place, {
              canvasId,
              boardId: created.boardId,
              items: input.placements.map((placement) => ({
                nodeId: placement.nodeId,
                spaceId: created.spaceIds[placement.space - 1],
              })),
            });
          } catch (error) {
            return toolError(
              `Board ${created.boardId} was created (spaces: ${created.spaceIds.join(", ")}), but no node was placed: ${errorMessage(error)}`,
            );
          }
        }

        return {
          success: true,
          boardId: created.boardId,
          spaceIds: created.spaceIds,
          titleNodeIds: created.titleNodeIds,
          placedNodeIds: nodeIds,
        };
      } catch (error) {
        return toolError(
          `Error while creating the board: ${errorMessage(error)}. Nothing was created.`,
        );
      }
    },
  });
}

export function editBoardTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Change a board: move nodes into its spaces, or change its grid. `placements` moves free nodes into the board, or moves nodes already in it to another space or rank; a node in a frame or another board cannot be moved. `grid` re-lays the board as columns × rows, keeping its spaces in reading order — nodes of a space that disappears fall back into the first space. Read the board with `nole read <boardId>` (bash) to see its space ids and what each holds.",
    inputSchema: z.object({
      explanation: EXPLANATION_FIELD,
      boardId: z.string().describe("The board's node id."),
      grid: z
        .object({ columns: columnsField, rows: rowsField })
        .optional()
        .describe("Optional new grid. Applied before the placements."),
      placements: z
        .array(
          z.object({
            nodeId: z.string(),
            spaceId: z.string().describe("Target space id."),
            index: z
              .number()
              .int()
              .min(0)
              .optional()
              .describe(
                "0-based rank in the space, among the nodes already there. Default: last.",
              ),
          }),
        )
        .optional()
        .describe("Optional nodes to place, applied in order."),
    }),
    execute: async (ctx, input) => {
      if (!input.grid && !input.placements?.length) {
        return toolError("Nothing to do: give a grid, placements, or both.");
      }
      try {
        const nodeIds = (input.placements ?? []).map((p) => p.nodeId);
        const invisible = await findInvisibleIds(ctx, canvasId, [
          input.boardId,
          ...nodeIds,
        ]);
        if (invisible.length > 0) {
          return toolError(
            `No node with this id on this canvas: ${invisible.join(", ")}. Nothing was changed.`,
          );
        }

        let grid: { spaceIds: string[]; removedSpaceIds: string[] } | null =
          null;
        if (input.grid) {
          grid = await ctx.runMutation(
            internal.wrappers.boardWrappers.setGrid,
            {
              canvasId,
              boardId: input.boardId,
              columns: input.grid.columns,
              rows: input.grid.rows,
              actor: {
                type: "agent",
                userId: threadCtx.authUserId,
                threadId: ctx.threadId,
              },
            },
          );
        }

        const placed = input.placements?.length
          ? await ctx.runMutation(internal.wrappers.boardWrappers.place, {
              canvasId,
              boardId: input.boardId,
              items: input.placements,
            })
          : [];

        return {
          success: true,
          boardId: input.boardId,
          ...(grid && {
            spaceIds: grid.spaceIds,
            ...(grid.removedSpaceIds.length > 0 && {
              removedSpaceIds: grid.removedSpaceIds,
              removedSpacesHint:
                "The nodes of these spaces now sit in the first space.",
            }),
          }),
          placed,
        };
      } catch (error) {
        return toolError(
          `Error while editing the board: ${errorMessage(error)}.${input.grid ? " The grid may already have been changed: read the board before retrying." : " Nothing was changed."}`,
        );
      }
    },
  });
}
