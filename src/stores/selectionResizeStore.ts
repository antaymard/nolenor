import { create } from "zustand";

/**
 * Le cadre de redimensionnement de la sélection (cf. `SelectionResizer`).
 *
 * `active` : le cadre est affiché, plusieurs nodes sont sélectionnés. Les
 * nodes masquent alors leurs propres poignées — deux jeux de poignées qui
 * disent deux choses différentes au même endroit, c'est un piège.
 *
 * Un store et pas une lecture de la sélection dans chaque node : un sélecteur
 * qui compte les nodes sélectionnés, posé sur N nodes, tournerait N fois à
 * chaque changement du store React Flow (donc à chaque frame d'un drag). Ici,
 * seul `SelectionResizer` compte, et les nodes ne lisent qu'un booléen.
 */
interface SelectionResizeStore {
  active: boolean;
  setActive: (active: boolean) => void;
}

export const useSelectionResizeStore = create<SelectionResizeStore>()(
  (set) => ({
    active: false,
    setActive: (active) =>
      set((state) => (state.active === active ? state : { active })),
  }),
);

export function useIsSelectionResizeActive(): boolean {
  return useSelectionResizeStore((state) => state.active);
}

/**
 * Les nodes dont l'utilisateur règle la taille, déclarés par `NodeFrame` au
 * rendu (son prop `resizable`). Les autres — titres, variantes compactes… —
 * suivent un redimensionnement de groupe sans changer de taille.
 *
 * Une liste tenue par les nodes plutôt qu'une règle par type : la
 * redimensionnabilité dépend de la variante, de l'option d'affichage, et
 * `NodeFrame` est le seul endroit où elle est déjà tranchée pour tous.
 * Pas d'état React : rien ne doit re-rendre quand elle change, elle n'est lue
 * qu'au début d'un geste.
 */
const resizableNodeIds = new Set<string>();

export function setNodeResizable(nodeId: string, resizable: boolean): void {
  if (resizable) resizableNodeIds.add(nodeId);
  else resizableNodeIds.delete(nodeId);
}

export function isNodeResizable(nodeId: string): boolean {
  return resizableNodeIds.has(nodeId);
}
