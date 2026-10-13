import { create } from "zustand";
import { pickLoadingTip } from "@/components/loading/loadingTips";

/**
 * L'écran de chargement, d'un bout à l'autre : du splash HTML (avant le JS)
 * au contenu du canvas, en passant par la résolution de l'auth.
 *
 * Plusieurs composants le peignent tour à tour (`BootLoader` à la racine, puis
 * ceux de `CanvasContent`), à l'identique : ce store porte ce qui doit survivre
 * au passage de l'un à l'autre — l'astuce, la barre de progression, et qui
 * tient l'écran.
 */
type LoadingScreenState = {
  tip: string;
  /** 0 → 1, ne recule jamais au sein d'une séance. */
  progress: number;
  /**
   * Le chargement de l'app est passé : `BootLoader` s'est effacé, ou a passé
   * la main à un canvas. Un canvas ouvert ensuite démarre sa propre séance.
   */
  bootDone: boolean;
  /** Un canvas a pris l'écran (cf. `useCanvasLoadingSession`). */
  canvasClaims: number;
  /**
   * Écrans de chargement montés : un écran qui en remplace un autre ne rejoue
   * pas son entrée. Lu au rendu via `getState`, jamais souscrit.
   */
  mountedScreens: number;

  setProgress: (progress: number) => void;
  finishBoot: () => void;
  /**
   * Un canvas prend l'écran. Arrivé pendant le boot, il continue sa séance
   * (même astuce, même barre) ; sinon il en ouvre une nouvelle.
   */
  claimCanvas: (startAt: number) => void;
  releaseCanvas: () => void;
  screenMounted: () => void;
  screenUnmounted: () => void;
};

export const useLoadingScreenStore = create<LoadingScreenState>()(
  (set, get) => ({
    tip: pickLoadingTip(),
    progress: 0,
    bootDone: false,
    canvasClaims: 0,
    mountedScreens: 0,

    setProgress: (progress) =>
      set((state) =>
        progress > state.progress
          ? { progress: Math.min(1, progress) }
          : state,
      ),
    finishBoot: () => {
      if (!get().bootDone) set({ bootDone: true });
    },
    claimCanvas: (startAt) =>
      set((state) =>
        state.bootDone
          ? {
              canvasClaims: state.canvasClaims + 1,
              tip: pickLoadingTip(),
              progress: startAt,
            }
          : {
              canvasClaims: state.canvasClaims + 1,
              progress: Math.max(state.progress, startAt),
            },
      ),
    // La barre repart de zéro pour le prochain canvas, plutôt que de
    // redescendre sous les yeux de l'utilisateur au montage de son écran.
    releaseCanvas: () =>
      set((state) => ({
        canvasClaims: Math.max(0, state.canvasClaims - 1),
        progress: state.bootDone ? 0 : state.progress,
      })),
    screenMounted: () =>
      set((state) => ({ mountedScreens: state.mountedScreens + 1 })),
    screenUnmounted: () =>
      set((state) => ({
        mountedScreens: Math.max(0, state.mountedScreens - 1),
      })),
  }),
);
