import { createContext, useContext } from "react";
import { useDebounce } from "@/hooks/use-debounce";

/**
 * Requête saisie dans l'input de recherche du panel latéral. Le frame en est
 * propriétaire ; les composants publiés par les bodies via `setPlanTabContent`
 * (rendus sous le Provider) la lisent pour filtrer leur contenu.
 */
const WindowSearchContext = createContext("");

export function useWindowSearchQuery() {
  return useContext(WindowSearchContext);
}

/** Le temps de finir un mot : inutile de chercher chaque préfixe tapé. */
const SEARCH_DEBOUNCE_MS = 150;

/**
 * `query` une fois la frappe posée, pour lancer la recherche. Vider l'input
 * s'applique tout de suite.
 */
export function useDebouncedSearchQuery(query: string) {
  const debounced = useDebounce(query, SEARCH_DEBOUNCE_MS);
  return query === "" ? "" : debounced;
}

export { WindowSearchContext };
