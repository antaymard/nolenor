import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import errors from "../config/errorsConfig";
import {
  BOARD_GAP,
  boardGridSize,
  buildBoardGrid,
  groupBoardChildren,
  listBoardSpaces,
  readBoardLayout,
  reuseSpaceIds,
  type BoardLayout,
} from "../config/boardConfig";
import { isContainerNodeType, nodeDataConfig } from "../config/nodeConfig";
import { orderKeysAt } from "../lib/orderKeys";
import { frameZIndexBelow } from "../lib/nodeLayering";
import type { NodeDataVersionActor } from "../schemas/nodeDataVersionsSchema";
import * as NodeDataModels from "./nodeDataModels";
import * as NodeModels from "./nodeModels";

/**
 * Les écritures d'un board côté serveur : le créer, ranger des nodes dans
 * ses espaces, changer sa grille. Ce que l'agent et le MCP appellent ; le
 * canvas, lui, range par le drag (cf. `useCanvasNodes`).
 *
 * Le serveur ne connaît pas la mise en page — c'est le DOM du canvas qui la
 * fait (cf. `useBoardLayout`). Il écrit le rangement (`placement`), qui est
 * la vraie donnée, et une position provisoire, que le premier éditeur qui
 * ouvre le canvas corrige.
 */

type NodeDoc = Doc<"nodes">;

/** Où poser un node rangé, en attendant que le canvas le mesure. */
const PROVISIONAL_POSITION = { x: BOARD_GAP, y: BOARD_GAP } as const;

async function getBoardOrThrow(
  ctx: MutationCtx,
  { canvasId, boardId }: { canvasId: Id<"canvases">; boardId: string },
): Promise<{ board: NodeDoc; layout: BoardLayout }> {
  const board = await NodeModels.getNodeByLlmId(ctx, { nodeId: boardId });
  if (!board || board.canvasId !== canvasId || board.status === "trashed") {
    throw new ConvexError(
      `${errors.NODE_NOT_FOUND} Unknown board "${boardId}".`,
    );
  }
  if (board.type !== "board") {
    throw new ConvexError(`Node ${boardId} is a ${board.type}, not a board.`);
  }
  const nodeData = await ctx.db.get("nodeDatas", board.nodeDataId);
  const layout = readBoardLayout(nodeData?.values?.layout);
  if (!layout) throw new ConvexError(`Board ${boardId} has an invalid layout.`);
  return { board, layout };
}

/**
 * Range des nodes dans les espaces d'un board, chacun à un rang (en fin
 * d'espace par défaut). Dans l'ordre donné : deux nodes rangés au même rang
 * du même espace se suivent dans cet ordre.
 *
 * Un node libre y entre ; un node déjà rangé dans ce board change d'espace ou
 * de rang. Tout autre node — dans une frame, dans un autre board, ou
 * conteneur lui-même — fait échouer l'appel entier, sans rien écrire : un
 * rangement partiel serait un board faux que l'appelant croirait juste.
 */
export async function placeNodesInBoard(
  ctx: MutationCtx,
  {
    canvasId,
    boardId,
    items,
  }: {
    canvasId: Id<"canvases">;
    boardId: string;
    items: Array<{ nodeId: string; spaceId: string; index?: number }>;
  },
): Promise<Array<{ nodeId: string; spaceId: string; index: number }>> {
  const { layout } = await getBoardOrThrow(ctx, { canvasId, boardId });
  const spaceIds = new Set(listBoardSpaces(layout).map((space) => space.id));

  const canvasNodes = (
    await NodeModels.listFromCanvas(ctx, { canvasId })
  ).filter((node) => node.status !== "trashed");
  const byId = new Map(canvasNodes.map((node) => [node.id, node]));

  for (const item of items) {
    const node = byId.get(item.nodeId);
    if (!node) {
      throw new ConvexError(
        `${errors.NODE_NOT_FOUND} Unknown on this canvas: ${item.nodeId}.`,
      );
    }
    if (isContainerNodeType(node.type)) {
      throw new ConvexError(
        `${errors.FRAME_CANNOT_BE_NESTED} ${item.nodeId} is a ${node.type}.`,
      );
    }
    if (node.parentId !== undefined && node.parentId !== boardId) {
      throw new ConvexError(
        `${errors.NODE_ALREADY_IN_A_FRAME} ${item.nodeId} is in ${node.parentId}.`,
      );
    }
    if (!spaceIds.has(item.spaceId)) {
      throw new ConvexError(
        `Board ${boardId} has no space "${item.spaceId}". Spaces: ${[...spaceIds].join(", ")}.`,
      );
    }
  }

  // Lu une fois, tenu à jour en mémoire : chaque rangement voit les
  // précédents, sans relire tout le canvas à chaque node.
  const children = canvasNodes.filter((node) => node.parentId === boardId);
  const placed: Array<{ nodeId: string; spaceId: string; index: number }> = [];

  for (const item of items) {
    const node = byId.get(item.nodeId)!;
    const siblings =
      groupBoardChildren(
        layout,
        children.filter((child) => child.id !== node.id),
      ).get(item.spaceId) ?? [];
    const index = Math.max(
      0,
      Math.min(item.index ?? siblings.length, siblings.length),
    );
    const [order] = orderKeysAt(
      siblings.map((sibling) => ({ order: sibling.placement?.order })),
      index,
      1,
    );
    const placement = { spaceId: item.spaceId, order };

    await NodeModels.patchNode(ctx, {
      nodeId: node.id,
      props: {
        parentId: boardId,
        placement,
        ...(node.parentId !== boardId && { position: PROVISIONAL_POSITION }),
      },
    });

    const updated = { ...node, parentId: boardId, placement };
    const at = children.findIndex((child) => child.id === node.id);
    if (at >= 0) children[at] = updated;
    else children.push(updated);
    placed.push({ nodeId: node.id, spaceId: item.spaceId, index });
  }
  return placed;
}

/**
 * Crée un board en grille de `columns` × `rows` espaces. `titles`, s'il est
 * donné, pose un node titre en tête des premiers espaces, dans l'ordre de
 * lecture : l'en-tête d'une colonne n'est rien d'autre.
 */
export async function createBoard(
  ctx: MutationCtx,
  {
    canvasId,
    position,
    columns,
    rows,
    titles,
    color,
    actor,
  }: {
    canvasId: Id<"canvases">;
    position: { x: number; y: number };
    columns: number;
    rows: number;
    titles?: string[];
    color?: string;
    actor?: NodeDataVersionActor;
  },
): Promise<{ boardId: string; spaceIds: string[]; titleNodeIds: string[] }> {
  const layout = buildBoardGrid(columns, rows);
  const spaceIds = listBoardSpaces(layout).map((space) => space.id);
  const canvasNodes = await NodeModels.listFromCanvas(ctx, { canvasId });

  const { nodeId: boardId } = await NodeModels.createNodeWithData(ctx, {
    node: {
      canvasId,
      type: "board",
      position,
      ...boardGridSize(columns, rows),
      // Sous les nodes, comme une frame : son fond ne doit rien recouvrir.
      zIndex: frameZIndexBelow(canvasNodes),
      ...(color !== undefined && { color }),
    },
    values: { layout },
    actor,
  });

  const titleConfig = nodeDataConfig.find((item) => item.type === "title")!;
  const titleNodeIds: string[] = [];
  for (const [i, text] of (titles ?? []).slice(0, spaceIds.length).entries()) {
    if (!text.trim()) continue;
    const { nodeId } = await NodeModels.createNodeWithData(ctx, {
      node: {
        canvasId,
        type: "title",
        position: PROVISIONAL_POSITION,
        width: titleConfig.defaultDimensions.width,
        height: titleConfig.defaultDimensions.height,
        color: "transparent",
        parentId: boardId,
        placement: { spaceId: spaceIds[i], order: orderKeysAt([], 0, 1)[0] },
      },
      values: { text: text.trim(), level: "h3" },
      actor,
    });
    titleNodeIds.push(nodeId);
  }

  return { boardId, spaceIds, titleNodeIds };
}

/**
 * Change la grille d'un board en gardant ses espaces dans l'ordre de lecture
 * (cf. `reuseSpaceIds`). Les nodes d'un espace qui disparaît retombent dans le
 * premier : rendus, jamais perdus.
 */
export async function setBoardGrid(
  ctx: MutationCtx,
  {
    canvasId,
    boardId,
    columns,
    rows,
    actor,
  }: {
    canvasId: Id<"canvases">;
    boardId: string;
    columns: number;
    rows: number;
    actor: NodeDataVersionActor;
  },
): Promise<{ spaceIds: string[]; removedSpaceIds: string[] }> {
  const { board, layout } = await getBoardOrThrow(ctx, { canvasId, boardId });
  const next = reuseSpaceIds(buildBoardGrid(columns, rows), layout);
  await NodeDataModels.updateValues(ctx, {
    _id: board.nodeDataId,
    values: { layout: next },
    actor,
  });
  const spaceIds = listBoardSpaces(next).map((space) => space.id);
  const kept = new Set(spaceIds);
  return {
    spaceIds,
    removedSpaceIds: listBoardSpaces(layout)
      .map((space) => space.id)
      .filter((id) => !kept.has(id)),
  };
}
