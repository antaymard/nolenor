import { orderKeysBetween } from "@/../convex/lib/orderKeys";

/**
 * Les clés d'ordre de nodes insérés dans un espace de board, au rang `index`
 * parmi ceux qui y sont déjà (`siblings`, dans l'ordre, sans les nodes
 * insérés). Seuls les insérés reçoivent une clé : leurs voisins ne bougent
 * pas en base.
 *
 * Un voisin sans clé (rangé autrement que par un drag) ne borne rien : on
 * prend la clé connue la plus proche de chaque côté. Deux voisins à clés
 * égales — deux dépôts simultanés au même endroit — ne laissent pas de place
 * entre eux : on se range alors juste après le premier.
 */
export function orderKeysAt(
  siblings: Array<{ order?: string }>,
  index: number,
  count: number,
): string[] {
  const before =
    siblings
      .slice(0, index)
      .map((sibling) => sibling.order)
      .filter((order): order is string => order !== undefined)
      .at(-1) ?? null;
  let after =
    siblings
      .slice(index)
      .map((sibling) => sibling.order)
      .find((order): order is string => order !== undefined) ?? null;
  if (before !== null && after !== null && before >= after) after = null;
  return orderKeysBetween(before, after, count);
}
