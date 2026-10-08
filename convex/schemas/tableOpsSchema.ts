import { v, type Infer } from "convex/values";
import { TABLE_COLUMN_TYPES } from "../lib/tableColumnTypes";

/**
 * Le vocabulaire d'écriture d'un node table : des opérations d'INTENTION
 * (« mets cette valeur dans cette cellule », « supprime cette ligne »), pas
 * des tables entières.
 *
 * C'est ce qui rend l'édition à plusieurs sûre : le serveur les applique à
 * l'état COURANT de la table (cf. `convex/lib/tableOps.ts`), donc deux
 * personnes qui écrivent dans deux cellules différentes gardent chacune leur
 * écriture, là où deux tables entières s'écrasaient. Même alphabet pour la
 * grille, l'agent et le MCP.
 *
 * Les positions sont relatives à un id (`afterRowId`, `beforeRowId`), jamais
 * des index : un index désigne une autre ligne dès que quelqu'un en insère
 * une au-dessus.
 */

const columnTypeValidator = v.union(
  ...TABLE_COLUMN_TYPES.map((type) => v.literal(type)),
);

const selectOptionValidator = v.object({
  id: v.string(),
  label: v.string(),
  color: v.string(),
});

export const tableColumnValidator = v.object({
  id: v.string(),
  name: v.string(),
  type: columnTypeValidator,
  width: v.optional(v.number()),
  options: v.optional(v.array(selectOptionValidator)),
  isMulti: v.optional(v.boolean()),
  summary: v.optional(v.string()),
});

const tableRowValidator = v.object({
  id: v.string(),
  // Valeurs de cellules : la forme dépend du type de colonne (texte, nombre,
  // lien, select…), validée en amont par les éditeurs et les tools.
  cells: v.record(v.string(), v.any()),
});

export const tableOpValidator = v.union(
  v.object({
    kind: v.literal("setCells"),
    cells: v.array(
      v.object({
        rowId: v.string(),
        columnId: v.string(),
        value: v.any(),
        // Le type de la colonne tel que l'écrivain l'a vu. Si elle a changé
        // de type entre-temps, la valeur est convertie au lieu d'être posée
        // telle quelle (du texte dans une colonne nombre).
        columnType: v.optional(columnTypeValidator),
      }),
    ),
  }),
  v.object({
    kind: v.literal("insertRows"),
    rows: v.array(tableRowValidator),
    // Ligne disparue entre-temps : insérées en fin de table.
    position: v.union(
      v.literal("start"),
      v.literal("end"),
      v.object({ afterRowId: v.string() }),
    ),
  }),
  v.object({
    kind: v.literal("deleteRows"),
    rowIds: v.array(v.string()),
  }),
  v.object({
    kind: v.literal("moveRow"),
    rowId: v.string(),
    // `null` : en fin de table.
    beforeRowId: v.union(v.string(), v.null()),
  }),
  v.object({
    kind: v.literal("addColumn"),
    column: tableColumnValidator,
  }),
  v.object({
    kind: v.literal("updateColumn"),
    columnId: v.string(),
    patch: v.object({
      name: v.optional(v.string()),
      type: v.optional(columnTypeValidator),
      width: v.optional(v.number()),
      // `null` : retire l'agrégat.
      summary: v.optional(v.union(v.string(), v.null())),
      options: v.optional(v.array(selectOptionValidator)),
      isMulti: v.optional(v.boolean()),
    }),
  }),
  v.object({
    kind: v.literal("deleteColumns"),
    columnIds: v.array(v.string()),
  }),
  v.object({
    kind: v.literal("moveColumn"),
    columnId: v.string(),
    beforeColumnId: v.union(v.string(), v.null()),
  }),
  v.object({
    // La vue est partagée : le node du canvas applique les mêmes filtres, tri
    // et hauteur de ligne que la window.
    kind: v.literal("setView"),
    view: v.object({
      rowHeight: v.optional(v.string()),
      filters: v.optional(v.array(v.any())),
      filterConjunction: v.optional(
        v.union(v.literal("all"), v.literal("any")),
      ),
      sorting: v.optional(v.array(v.any())),
    }),
  }),
  v.object({
    kind: v.literal("setTitle"),
    title: v.string(),
  }),
  v.object({
    // Import CSV en mode remplacement.
    kind: v.literal("replaceAll"),
    columns: v.array(tableColumnValidator),
    rows: v.array(tableRowValidator),
  }),
);

export type TableOp = Infer<typeof tableOpValidator>;
export type TableOpColumn = Infer<typeof tableColumnValidator>;
