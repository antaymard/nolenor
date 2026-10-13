import { useEffect, useLayoutEffect, useState } from "react";
import { useConvexAuth } from "convex/react";
import { useLoadingScreenStore } from "@/stores/loadingScreenStore";
import LoadingScreen from "./LoadingScreen";

/** Id du splash d'`index.html`, peint avant le JS. */
const SPLASH_ID = "boot-splash";
/** Progression une fois l'auth connue, quand un canvas doit suivre. */
const AUTH_RESOLVED_PROGRESS = 0.25;
/**
 * Garde-fou : un canvas attendu qui ne prend jamais l'écran (route en erreur,
 * chunk perdu…) ne doit pas laisser l'app derrière un chargement sans fin.
 */
const CANVAS_CLAIM_TIMEOUT_MS = 10_000;
/** Même seuil que `useIsMobile`. */
const MOBILE_BREAKPOINT = 768;

/**
 * Le chargement de l'app, au-dessus de tout : il reprend le splash HTML à
 * l'identique, attend l'auth, puis s'efface — ou, sur une URL de canvas, passe
 * la main à l'écran de chargement du canvas, qui reprend la même barre et la
 * même astuce (cf. `useCanvasLoadingSession`). D'un bout à l'autre, un seul
 * écran de chargement pour l'utilisateur.
 */
export default function BootLoader() {
  const { isLoading: isAuthLoading, isAuthenticated } = useConvexAuth();
  const bootDone = useLoadingScreenStore((state) => state.bootDone);
  const canvasClaimed = useLoadingScreenStore(
    (state) => state.canvasClaims > 0,
  );
  const [timedOut, setTimedOut] = useState(false);

  // Figé au chargement : c'est l'URL d'arrivée qui décide de la suite. Sur
  // téléphone, un utilisateur connecté a le shell mobile, qui ne prend pas
  // l'écran.
  const [arrivedOnCanvas] = useState(() =>
    /^\/canvas\/[^/]+/.test(window.location.pathname),
  );
  const [isPhone] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
  const expectsCanvas = arrivedOnCanvas && !(isPhone && isAuthenticated);

  // Le splash a la même géométrie : on reprend sa barre où elle en est, puis
  // on le retire avant la première peinture.
  useLayoutEffect(() => {
    const splash = document.getElementById(SPLASH_ID);
    if (!splash) return;
    const fill = splash.querySelector<HTMLElement>(".loading-screen__fill");
    const track = fill?.parentElement;
    if (fill && track && track.clientWidth > 0) {
      useLoadingScreenStore
        .getState()
        .setProgress(fill.getBoundingClientRect().width / track.clientWidth);
    }
    splash.remove();
  }, []);

  useEffect(() => {
    if (isAuthLoading) return;
    useLoadingScreenStore
      .getState()
      .setProgress(expectsCanvas ? AUTH_RESOLVED_PROGRESS : 1);
  }, [isAuthLoading, expectsCanvas]);

  useEffect(() => {
    if (isAuthLoading || !expectsCanvas || canvasClaimed) return;
    const timer = setTimeout(() => setTimedOut(true), CANVAS_CLAIM_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [isAuthLoading, expectsCanvas, canvasClaimed]);

  // Passage de main : l'écran du canvas, identique, est déjà peint dessous.
  const handedOver = !isAuthLoading && canvasClaimed;
  useEffect(() => {
    if (handedOver) useLoadingScreenStore.getState().finishBoot();
  }, [handedOver]);

  if (handedOver) return null;

  const isDone = bootDone || (!isAuthLoading && (!expectsCanvas || timedOut));

  return (
    <LoadingScreen
      visible={!isDone}
      enter="tip"
      // Au-dessus des dialogs (z-50) : rien de l'app ne doit percer.
      className="fixed z-[60]"
      onHidden={() => useLoadingScreenStore.getState().finishBoot()}
    />
  );
}
