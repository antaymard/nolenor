import { create } from "zustand";

/**
 * La frame survolée par un node en cours de drag — celle qui l'accueillera au
 * relâcher, et qui s'entoure pour le dire.
 *
 * Un store et pas un état dans `CanvasFlow` : le survol change à chaque frame
 * du geste, et un état porté par le canvas ferait re-rendre tous les nodes à
 * ce rythme. Ici, chaque `FrameNode` s'abonne au seul booléen qui le concerne
 * (`hoveredFrameId === monId`), donc deux frames re-rendent quand le survol
 * passe de l'une à l'autre, et aucune autre.
 *
 * Éphémère par nature : rien n'est persisté, et le survol se vide au relâcher.
 */
interface FrameHoverStore {
  hoveredFrameId: string | null;
  setHoveredFrameId: (frameId: string | null) => void;
}

export const useFrameHoverStore = create<FrameHoverStore>()((set) => ({
  hoveredFrameId: null,
  setHoveredFrameId: (frameId) =>
    set((state) =>
      state.hoveredFrameId === frameId ? state : { hoveredFrameId: frameId },
    ),
}));

/** S'abonne au seul survol de CETTE frame. */
export function useIsFrameHovered(frameId: string): boolean {
  return useFrameHoverStore((state) => state.hoveredFrameId === frameId);
}
