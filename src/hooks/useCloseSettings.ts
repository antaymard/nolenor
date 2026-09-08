import { useState } from "react";
import { useLocation, useRouter } from "@tanstack/react-router";

// Un `from` n'est utilisable que s'il pointe vers une page interne de l'app,
// hors settings (sinon la croix bouclerait dans les settings) et hors signin.
function asUsableReturnTo(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//")
  ) {
    return null;
  }
  if (value === "/settings" || value.startsWith("/settings/")) return null;
  if (value === "/signin" || value.startsWith("/signin/")) return null;
  return value;
}

// `document.referrer` ne reflète que le chargement complet du document (pas la
// nav SPA) : quand aucun `from` n'a été mémorisé, un referrer cross-origin
// signifie que `back()` ferait quitter l'app — on préfère le home.
function cameFromOutsideApp(): boolean {
  const referrer = document.referrer;
  if (!referrer) return false;
  try {
    return new URL(referrer).origin !== window.location.origin;
  } catch {
    return false;
  }
}

// Ferme les settings vers le contexte d'origine : la page mémorisée dans
// `location.state.from` par le lien d'entrée (canvas, home…), sinon l'historique
// navigateur, sinon `/`. Le `from` est capturé une seule fois au montage du
// layout : naviguer entre les onglets des settings ne l'écrase pas, donc la
// croix ne renvoie jamais vers une autre page de settings.
export function useCloseSettings(): () => void {
  const router = useRouter();
  const location = useLocation();
  const [returnTo] = useState<string | null>(() =>
    asUsableReturnTo(location.state.from),
  );

  return () => {
    if (returnTo) {
      router.history.push(returnTo);
      return;
    }
    if (cameFromOutsideApp() || !router.history.canGoBack()) {
      void router.navigate({ to: "/" });
      return;
    }
    router.history.back();
  };
}
