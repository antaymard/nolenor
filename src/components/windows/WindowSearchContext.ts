import { createContext, useContext } from "react";

/**
 * Requête saisie dans l'input de recherche du panel latéral. Le frame en est
 * propriétaire ; les composants publiés par les bodies via `setPlanTabContent`
 * (rendus sous le Provider) la lisent pour filtrer leur contenu.
 */
const WindowSearchContext = createContext("");

export function useWindowSearchQuery() {
  return useContext(WindowSearchContext);
}

export { WindowSearchContext };

/** Match insensible à la casse et aux accents ; une requête vide matche tout. */
export function matchesSearchQuery(text: string, query: string): boolean {
  const needle = normalize(query);
  return needle === "" || normalize(text).includes(needle);
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
