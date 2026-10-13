import { useEffect, useLayoutEffect } from "react";
import { useLoadingScreenStore } from "@/stores/loadingScreenStore";

/**
 * Où démarre la barre d'un canvas ouvert depuis l'app : l'app est déjà
 * chargée, il ne reste que le canvas. À l'arrivée sur une URL de canvas, la
 * barre continue depuis le boot (cf. `BootLoader`).
 */
const CANVAS_SESSION_START = 0.15;

/**
 * Le canvas prend l'écran de chargement pour toute sa vie : à l'arrivée sur
 * l'app, `BootLoader` lui passe la main dès ce montage ; ouvert depuis l'app,
 * il ouvre une nouvelle séance (nouvelle astuce, barre repartie de
 * `CANVAS_SESSION_START`).
 *
 * À appeler en tête de `CanvasContent`, avant tout retour anticipé : même un
 * écran d'erreur doit libérer `BootLoader`.
 *
 * `progress` : l'avancement du chargement du canvas (cf.
 * `useCanvasBootstrap`), versé dans la barre partagée.
 */
export function useCanvasLoadingSession(progress: number) {
  // Avant la peinture : `BootLoader` doit s'effacer dans la même frame que
  // celle où l'écran du canvas apparaît dessous.
  useLayoutEffect(() => {
    const { claimCanvas, releaseCanvas } = useLoadingScreenStore.getState();
    claimCanvas(CANVAS_SESSION_START);
    return releaseCanvas;
  }, []);

  useEffect(() => {
    useLoadingScreenStore.getState().setProgress(progress);
  }, [progress]);
}
