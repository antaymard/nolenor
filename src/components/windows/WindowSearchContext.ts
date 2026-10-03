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
