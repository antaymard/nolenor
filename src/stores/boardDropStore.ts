import { create } from "zustand";

/**
 * Où un drag en cours atterrirait dans un board : l'espace, et le rang
 * d'insertion parmi ce qu'il range déjà (hors nodes portés par le geste).
 *
 * Même rôle que `frameHoverStore`, en plus fin : l'espace visé dessine une
 * ligne au point d'insertion, et le relâcher (`flushDragPositions`) y range
 * les nodes. Éphémère : vidé au relâcher.
 */
export type BoardDropTarget = {
  boardId: string;
  spaceId: string;
  index: number;
};

interface BoardDropStore {
  target: BoardDropTarget | null;
  setTarget: (target: BoardDropTarget | null) => void;
}

export const useBoardDropStore = create<BoardDropStore>()((set) => ({
  target: null,
  setTarget: (target) =>
    set((state) =>
      state.target?.boardId === target?.boardId &&
      state.target?.spaceId === target?.spaceId &&
      state.target?.index === target?.index
        ? state
        : { target },
    ),
}));

/** Le rang d'insertion dans CET espace, `null` s'il n'est pas visé. */
export function useBoardDropIndex(spaceId: string): number | null {
  return useBoardDropStore((state) =>
    state.target?.spaceId === spaceId ? state.target.index : null,
  );
}

/** Un drag vise-t-il CE board ? Sa mise en page est alors gelée. */
export function useIsBoardDropTarget(boardId: string): boolean {
  return useBoardDropStore((state) => state.target?.boardId === boardId);
}
