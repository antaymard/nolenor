// Liste canonique des types de colonnes d'un node table.
//
// Elle vivait à cinq endroits : l'union côté client, celle de la validation des
// cellules, celle de l'outil de schéma, le z.enum de création de node, et la
// liste d'import CSV. Ajouter `richtext` demandait donc cinq éditions, dont
// trois qui échouent SILENCIEUSEMENT — le build passe, l'agent ne voit
// simplement pas le nouveau type. C'est exactement ce qui est arrivé.
//
// Même parti pris que `convex/config/templateConfig.ts` et
// `src/components/fields/FieldHost.tsx` : le prochain type doit échouer à la
// compilation, pas à l'exécution.
//
// Placé dans `convex/lib` parce que les deux côtés en ont besoin et que le
// frontend importe déjà ce dossier (cf. `@/../convex/lib/blockNoteDocument`).

export const TABLE_COLUMN_TYPES = [
  "text",
  "richtext",
  "number",
  "checkbox",
  "select",
  "date",
  "link",
  "node",
] as const;

export type TableColumnType = (typeof TABLE_COLUMN_TYPES)[number];

/**
 * Garde d'exhaustivité pour les `switch` sur `TableColumnType`.
 *
 * À utiliser dans les branches `default` des transformations de DONNÉES
 * (conversion, filtre, agrégat, export) : y oublier un type produit des valeurs
 * fausses en silence. Les composants de VUE gardent une retombée textuelle,
 * afficher un type inconnu comme du texte étant un comportement raisonnable.
 */
export function assertNeverColumnType(type: never, context: string): never {
  throw new Error(
    `Unhandled table column type "${String(type)}" in ${context}.`,
  );
}

/** Pour les descriptions lues par le LLM, qui listaient un jeu de types périmé. */
export function listColumnTypesForPrompt(): string {
  return TABLE_COLUMN_TYPES.join(", ");
}
