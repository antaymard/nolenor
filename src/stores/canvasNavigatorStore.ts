import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { Id } from "@/../convex/_generated/dataModel";
import type { FramingDelta, ViewportFraming } from "@/lib/canvasViewportFraming";

/** Un repère de navigation, tel que la palette a besoin de le connaître. */
export type NavigatorMarker = {
  xyNodeId: string;
  nodeDataId: Id<"nodeDatas"> | undefined;
  title: string;
  /** `null` si la value `view` est absente ou abîmée : ligne non navigable. */
  framing: ViewportFraming | null;
  /**
   * Cap + distance au moment de l'instantané (`null` si pas de cadrage ou pane
   * non mesuré). Figé et non abonné : la vue ne bouge pas tant que la modale
   * est ouverte, il est donc toujours juste — cf. `CommandCenter`.
   */
  delta: FramingDelta | null;
};

/**
 * La poignée qu'un canvas monté expose au reste de l'app.
 *
 * Deux fonctions, pas de données : lues à la demande, jamais abonnées.
 */
export type CanvasNavigator = {
  /** Les repères du canvas, déjà triés comme la liste les affiche. */
  getMarkers: () => NavigatorMarker[];
  goTo: (framing: ViewportFraming) => void;
};

/**
 * Le pont entre le command center et le canvas.
 *
 * `CommandCenter` est monté à la racine (`__root.tsx`) pour répondre depuis
 * n'importe quelle route : il est donc HORS du `ReactFlowProvider`, et ne peut
 * appeler ni `useReactFlow()` ni `useGoToFraming()`. Ce store porte une
 * poignée impérative que le canvas enregistre à son montage
 * (`CanvasNavigatorBridge`) — et non une copie des nodes : la convention du
 * repo est de laisser l'état des nodes à React Flow plutôt que de le
 * dupliquer dans Zustand.
 *
 * `navigator` vaut `null` hors d'un canvas ; les appelants doivent le tester.
 */
interface CanvasNavigatorStore {
  navigator: CanvasNavigator | null;
  register: (navigator: CanvasNavigator) => void;
  /**
   * Ne désenregistre que si la poignée passée est toujours celle en place.
   *
   * Au changement de canvas, `ReactFlowProvider key={canvasId}` remonte tout,
   * et React peut monter le nouveau bridge avant de démonter l'ancien : sans
   * ce test, le cleanup du sortant effacerait la poignée de l'entrant.
   */
  unregister: (navigator: CanvasNavigator) => void;
}

export const useCanvasNavigatorStore = create<CanvasNavigatorStore>()(
  devtools(
    (set) => ({
      navigator: null,
      register: (navigator) => {
        set({ navigator });
      },
      unregister: (navigator) => {
        set((state) =>
          state.navigator === navigator ? { navigator: null } : state,
        );
      },
    }),
    { name: "canvas-navigator-store" },
  ),
);
