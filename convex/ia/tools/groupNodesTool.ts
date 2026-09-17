import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { internal } from "../../_generated/api";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import {
  getDefaultNodeDataValues,
  getNodeCapabilities,
} from "../../config/nodeConfig";
import { EXPLANATION_FIELD, type ToolConfig, toolError } from "./toolHelpers";

/** Les couleurs qu'un node peut porter, comme `create_node` les publie. */
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

/**
 * En dessous, ce n'est pas un groupe.
 *
 * Règle de la surface agent et pas du modèle : le tracé de l'utilisateur, lui,
 * a le droit de poser une frame vide ou autour d'un seul node — il la voit, il
 * la déplace, il la supprime d'un clic. L'agent n'a rien de tout ça.
 */
const MIN_GROUPED_NODES = 2;

export const groupNodesToolConfig: ToolConfig = {
  name: "group_nodes",
  authorized_agents: [toolAgentNames.nole, toolAgentNames.worker],
  mcp: { access: "write" },
};

/**
 * Tracer une frame autour de nodes qui existent déjà.
 *
 * C'est la SEULE porte de création d'une frame pour l'agent : `create_node` ne
 * l'accepte pas en type, et c'est voulu — une frame vide posée à côté du
 * contenu par l'auto-placement ne groupe rien.
 *
 * Refuse plutôt que d'arranger. L'agent n'a aucun tool pour défaire : pas de
 * dégroupement, pas de déplacement, pas de corbeille, et ses écritures
 * n'entrent dans aucune pile d'annulation. Un id inconnu ou un node déjà pris
 * fait donc échouer l'appel entier, sans rien écrire — à l'inverse des
 * `sourceNodes` de `create_node`, qui écarte et rapporte. Là-bas le node existe
 * déjà et une edge en moins se rattrape ; ici la liste des ids EST l'objet
 * qu'on crée, et un membre écarté en silence donnerait une frame fausse que
 * l'agent croirait juste.
 */
export default function groupNodesTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description:
      "Draw a frame around nodes that already exist, to make a group explicit. This is the only way to create a frame — create_node does not accept the type. Membership is one-way: you cannot take a node out of a frame afterwards, move it to another frame, or rename the frame, and deleting a frame deletes everything in it. So group only what clearly belongs together. Every id must be a free node of this canvas: a node already in a frame, or a frame itself, makes the whole call fail without creating anything. To add a NEW node to the frame afterwards, pass frameId to create_node.",
    inputSchema: z.object({
      explanation: EXPLANATION_FIELD,
      nodeIds: z
        .array(z.string())
        .describe(
          `The ids of the existing nodes to group, at least ${MIN_GROUPED_NODES}. The frame is drawn as their bounding box plus a margin.`,
        ),
      title: z
        .string()
        .describe(
          "The frame's name, shown above it. Required: a frame cannot be renamed afterwards, and an untitled one says nothing in the canvas structure map.",
        ),
      color: z
        .enum(nodeColorValues)
        .optional()
        .describe("Optional color of the frame."),
    }),
    execute: async (ctx, input) => {
      console.log(`📦 Grouping ${input.nodeIds.length} node(s) into a frame`);

      try {
        const uniqueIds = [...new Set(input.nodeIds)];
        if (uniqueIds.length < MIN_GROUPED_NODES) {
          return toolError(
            `A frame groups at least ${MIN_GROUPED_NODES} nodes, ${uniqueIds.length} given. One node on its own is a border, not a group — and you cannot dissolve a frame once it exists.`,
          );
        }

        const title = input.title.trim();
        if (!title) {
          return toolError(
            "title is required: a frame cannot be renamed afterwards.",
          );
        }

        // Les types que l'agent n'est pas censé voir sont traités comme
        // inconnus, sans nommer leur type : `list_nodes` les filtre
        // entièrement, les révéler ici lui apprendrait leur existence. Le
        // contrôle est ici et pas dans le modèle — l'utilisateur, lui, a le
        // droit d'encadrer n'importe quel node de son canvas.
        const { nodes } = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getCanvasNodesAndEdges,
          { canvasId },
        );
        const byId = new Map(nodes.map((node) => [node.id, node]));
        const invisible = uniqueIds.filter((nodeId) => {
          const node = byId.get(nodeId);
          return node !== undefined
            ? !getNodeCapabilities(node.type).agent.readable
            : false;
        });
        if (invisible.length > 0) {
          return toolError(
            `No node with this id on this canvas: ${invisible.join(", ")}. Nothing was created.`,
          );
        }

        const defaultValues = getDefaultNodeDataValues("frame");
        if (!defaultValues || typeof defaultValues !== "object") {
          return toolError("Could not resolve the default values of a frame.");
        }

        const result = await ctx.runMutation(
          internal.wrappers.nodeWrappers.createFrameAround,
          {
            canvasId,
            nodeIds: uniqueIds,
            // Le `level` vient des défauts du type, pas d'un arg : l'agent
            // n'aurait qu'une seule occasion de l'écrire (renommer reste
            // refusé), donc autant qu'il hérite de la taille qu'une frame
            // tracée à la main reçoit.
            values: { ...defaultValues, title },
            ...(input.color && { color: input.color }),
            actor: {
              type: "agent",
              userId: threadCtx.authUserId,
              threadId: ctx.threadId,
            },
          },
        );

        console.log(`✅ Frame ${result.frameId} created`);

        return {
          success: true,
          frameId: result.frameId,
          title,
          nodeIds: result.memberIds,
          position: result.position,
          dimensions: { width: result.width, height: result.height },
          // Ces nodes tombent dans la boîte sans être membres : la frame est
          // derrière eux, donc ils ont l'air groupés et ne le sont pas. Le
          // seul fait que l'agent ne peut pas obtenir autrement.
          ...(result.enclosedNonMembers.length > 0 && {
            enclosedNonMembers: result.enclosedNonMembers,
            enclosedNonMembersHint:
              "These nodes sit inside the frame's box but are NOT in it: they look grouped and are not. Mention it to the user if it matters; you cannot add them to the frame.",
          }),
        };
      } catch (error) {
        return toolError(
          `Error while grouping nodes: ${error instanceof Error ? error.message : String(error)}. Nothing was created.`,
        );
      }
    },
  });
}
