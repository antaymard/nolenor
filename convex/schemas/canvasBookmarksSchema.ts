import { v, type Infer } from "convex/values";

// Les repères personnels d'un utilisateur sur un canvas : les successeurs des
// `hotspots` et `slideshows` retirés du produit (cf. le commentaire de
// `canvasesSchema.ts` et `migrations:purgeViewportNodes`). Deux différences de
// fond avec eux : ils vivent dans leur propre table au lieu d'un tableau inline
// sur le doc `canvases`, et ils appartiennent à un utilisateur, pas au canvas —
// deux membres d'un canvas partagé ne voient jamais les repères de l'autre.

// ── Sub-validators ──────────────────────────────────────────────────────

// Même forme que le `ViewportFraming` du front (`src/lib/canvasViewportFraming.ts`)
// et que le `?v=cx,cy,zoom` des liens partagés : un centre en coordonnées MONDE
// et un zoom, jamais l'offset écran du pane. Stocker l'offset lierait le repère
// à la taille de la fenêtre au moment de la capture — le même bookmark ne
// montrerait pas la même zone sur un 13" et sur un 27".
const bookmarkFramingValidator = v.object({
  cx: v.number(),
  cy: v.number(),
  zoom: v.number(),
});

/**
 * Ce que vise un repère. Trois formes, et le choix décide de ce qui se passe
 * quand le canvas bouge :
 *
 * - `node` et `selection` portent des llmid (`nodes.id`), donc le repère SUIT
 *   ce qu'il vise, y compris dans une frame — `fitView` lit les positions
 *   absolues que React Flow maintient.
 * - `framing` porte un point du monde, donc il est FIGÉ : déplacer les nodes
 *   laisse le repère sur du vide. C'est le prix d'un repère « lieu » plutôt
 *   que « chose », et c'est le comportement voulu.
 *
 * Des llmid et non des `Id<"nodes">` : c'est la clé métier que parlent déjà les
 * edges, `parentId`, les mentions `[[node:…]]` et `searchableChunks.nodeId`.
 */
const bookmarkTargetValidator = v.union(
  v.object({ kind: v.literal("node"), nodeId: v.string() }),
  v.object({ kind: v.literal("framing"), framing: bookmarkFramingValidator }),
  v.object({ kind: v.literal("selection"), nodeIds: v.array(v.string()) }),
);

// ── Main validator ──────────────────────────────────────────────────────

const canvasBookmarksValidator = v.object({
  userId: v.id("users"),
  canvasId: v.id("canvases"),
  /**
   * Absent tant que l'utilisateur n'a pas nommé le repère lui-même. Un
   * bookmark `node` sans libellé est alors affiché avec le titre courant de son
   * node : renommer le node renomme le repère, ce qui est ce qu'on attend d'un
   * raccourci vers lui. Dès qu'il est nommé, il se fige et ne suit plus.
   *
   * Toujours posé pour `framing` et `selection`, qui n'ont aucun titre d'où
   * retomber.
   */
  label: v.optional(v.string()),
  target: bookmarkTargetValidator,
  /**
   * Ordre d'affichage dans le panneau, choisi par l'utilisateur. Explicite et
   * pas déduit de `_creationTime` : le dernier posé n'est pas forcément celui
   * qu'on veut en tête, et la liste se réordonne au drag.
   */
  sortOrder: v.number(),
  updatedAt: v.number(),
});

type BookmarkTarget = Infer<typeof bookmarkTargetValidator>;
type BookmarkFraming = Infer<typeof bookmarkFramingValidator>;

export {
  bookmarkFramingValidator,
  bookmarkTargetValidator,
  canvasBookmarksValidator,
};
export type { BookmarkFraming, BookmarkTarget };
