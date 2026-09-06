/**
 * Colonnes techniques de la grille : la gouttière de gauche (numéro de ligne,
 * poignée de drag, ouverture en fiche) et la colonne d'actions de droite
 * (ajout de colonne, suppression de ligne). Elles ne sont pas des `TableColumn`
 * et doivent être exclues du drag de colonnes comme du tri.
 */
export const GUTTER_COLUMN_ID = "__gutter__";
export const ACTIONS_COLUMN_ID = "__actions__";

export function isUtilityColumn(id: string): boolean {
  return id === GUTTER_COLUMN_ID || id === ACTIONS_COLUMN_ID;
}
