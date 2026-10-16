import { z } from "zod";
import {
  buildLayoutContainerSchema,
  collectLayoutLeaves,
  genLayoutId,
  type LayoutContainer,
} from "../lib/layoutTree";

/**
 * Le board : une frame dont l'arbre de layout (cf. `convex/lib/layoutTree.ts`)
 * a pour feuilles des ESPACES, qui rangent d'autres nodes du canvas.
 *
 * Un enfant du board le déclare en `parentId`, comme pour une frame, et porte
 * en plus un `placement` (espace + clé d'ordre) sur sa ligne `nodes`. C'est
 * la seule vraie donnée : sa position s'en déduit, mesurée par le canvas
 * (cf. `useBoardLayout`).
 *
 * L'arbre est propre à chaque board : un Kanban ou une matrice ne sont que
 * des arbres de départ.
 */

export type BoardSpace = { kind: "space"; id: string };
export type BoardDivider = { kind: "divider"; id: string };
export type BoardLeaf = BoardSpace | BoardDivider;
export type BoardLayout = LayoutContainer<BoardLeaf>;

const boardLeafSchema: z.ZodType<BoardLeaf> = z.union([
  z.strictObject({ kind: z.literal("space"), id: z.string().min(1).max(64) }),
  z.strictObject({ kind: z.literal("divider"), id: z.string().min(1).max(64) }),
]);

export const boardLayoutSchema = buildLayoutContainerSchema(boardLeafSchema);

/** Au-delà, l'arbre ne se lit plus d'un coup d'œil. */
export const MAX_BOARD_LAYOUT_DEPTH = 4;

/** Marges codées en dur pour commencer (cf. spec) : une seule valeur partout. */
export const BOARD_GAP = 16;

/**
 * Un espace vide garde une taille où déposer, et une colonne de Kanban une
 * largeur lisible même avec des cartes étroites.
 */
export const SPACE_MIN_WIDTH = 280;
export const SPACE_MIN_HEIGHT = 120;

const space = (): BoardSpace => ({ kind: "space", id: genLayoutId("s") });

const container = (
  direction: "row" | "column",
  children: BoardLayout["children"],
): BoardLayout => ({
  kind: "container",
  id: genLayoutId("c"),
  direction,
  gap: BOARD_GAP,
  align: "stretch",
  children,
});

export const BOARD_PRESETS = {
  kanban: () => ({
    ...container("row", [space(), space(), space()]),
    padding: BOARD_GAP,
  }),
  matrix: () => ({
    ...container("column", [
      container("row", [space(), space()]),
      container("row", [space(), space()]),
    ]),
    padding: BOARD_GAP,
  }),
} satisfies Record<string, () => BoardLayout>;

export type BoardPreset = keyof typeof BOARD_PRESETS;

/** L'arbre stocké, ou `null` s'il n'a pas la forme (rendu dégradé, pas de crash). */
export function readBoardLayout(value: unknown): BoardLayout | null {
  const parsed = boardLayoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function listBoardSpaces(layout: BoardLayout): BoardSpace[] {
  return collectLayoutLeaves(layout).filter(
    (leaf): leaf is BoardSpace => leaf.kind === "space",
  );
}

/**
 * L'espace d'un enfant : le sien s'il existe encore, sinon le premier. Un
 * espace retiré de l'arbre ne fait donc disparaître aucun node — il retombe
 * dans le premier, sans écriture.
 */
export function resolveSpaceId(
  layout: BoardLayout,
  spaceId: string | undefined,
): string | null {
  const spaces = listBoardSpaces(layout);
  if (spaceId && spaces.some((s) => s.id === spaceId)) return spaceId;
  return spaces[0]?.id ?? null;
}

/**
 * Un arbre neuf (un autre modèle) qui reprend les espaces de l'ancien, dans
 * l'ordre : passer d'un Kanban à une matrice laisse les nodes de la première
 * colonne dans la première case, et ainsi de suite. Les espaces en trop de
 * l'ancien arbre disparaissent — leurs nodes retombent dans le premier.
 */
export function reuseSpaceIds(
  next: BoardLayout,
  previous: BoardLayout,
): BoardLayout {
  const ids = listBoardSpaces(previous).map((space) => space.id);
  let index = 0;
  const walk = (node: BoardLayout["children"][number]): typeof node => {
    if (node.kind === "container") {
      return { ...node, children: node.children.map(walk) };
    }
    if (node.kind === "space" && index < ids.length) {
      return { ...node, id: ids[index++] };
    }
    return node;
  };
  return walk(next) as BoardLayout;
}
