import { useEffect } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import type { Edge } from "@xyflow/react";
import { useNoleStore } from "@/stores/noleStore";
import type { CanvasNode } from "@/types/convex";

/**
 * Valeur brute du param `?onboarding=` tel que validé par le schéma de la
 * route canvas (`routes/canvas/$canvasId.tsx`).
 *
 * TanStack Router parse `?onboarding=true` en booléen `true`, mais une URL
 * copiée/collée ou construite à la main peut arriver en chaîne `"true"` : on
 * accepte les deux, et `isOnboardingSearchParam` normalise.
 */
export type OnboardingSearchParam = boolean | "true" | "false" | undefined;

/** `true` quand le param vaut `true` (booléen) ou `"true"` (chaîne). */
export function isOnboardingSearchParam(value: unknown): boolean {
  return value === true || value === "true";
}

/**
 * `true` quand le param vaut `false` (booléen) ou `"false"` (chaîne) :
 * l'utilisateur a explicitement quitté l'onboarding (« Start from scratch »
 * ou envoi depuis l'onboarding). Tant qu'il est là, on ne re-entre jamais —
 * c'est ce qui rend la sortie manuelle effective sur un canvas encore vide.
 * Le param est nettoyé dès que le canvas ne l'est plus : il n'est utile que
 * tant que le canvas est vide.
 */
export function isDismissedOnboardingSearchParam(value: unknown): boolean {
  return value === false || value === "false";
}

type UseEmptyCanvasOnboardingArgs = {
  flowNodes: CanvasNode[] | undefined;
  flowEdges: Edge[] | undefined;
  /**
   * Seul un éditeur connecté bascule tout seul vers l'onboarding : un viewer
   * (ou un visiteur anonyme) sur un canvas partagé vide n'a rien à y créer,
   * et le chat d'onboarding ne pourrait pas envoyer en son nom.
   */
  canAutoEnter: boolean;
};

/**
 * Fondations de l'onboarding canvas vide.
 *
 * - Canvas vide (nodes ET edges chargés, les deux à zéro) + éditeur connecté
 *   → ajoute `?onboarding=true` à l'URL (`replace`, préserve `?v=` / `?thread=`).
 * - Canvas qui ne l'est plus (Nolë vient d'y créer le premier node) alors que
 *   le param est encore là → retire le param, le canvas normal reprend.
 * - Le rendu reste au pilotage de l'URL : l'appelant affiche
 *   `EmptyCanvasWithNole` quand `showOnboarding`, et rien (le temps de la
 *   redirection) quand `isRedirectPending` — jamais un React Flow vide.
 *
 * Desktop uniquement pour l'instant (`CanvasContent`) : le shell mobile
 * (`MobileCanvas`) garde son rendu actuel sur canvas vide.
 *
 * Ne re-entre jamais après une sortie explicite (`?onboarding=false` : « Start
 * from scratch » ou envoi depuis l'onboarding, qui ferme le param alors que
 * le canvas est encore vide) ni quand une conversation est déjà désignée
 * (`activeThreadId`) : sans ces gardes l'effet re-ajouterait
 * `?onboarding=true` dans la foulée et `isRedirectPending` resterait bloqué
 * sur le spinner.
 */
export function useEmptyCanvasOnboarding({
  flowNodes,
  flowEdges,
  canAutoEnter,
}: UseEmptyCanvasOnboardingArgs): {
  isEmpty: boolean;
  isOnboarding: boolean;
  showOnboarding: boolean;
  isRedirectPending: boolean;
} {
  // `select` borne l'abonnement au seul `onboarding` : sans lui, chaque
  // frappe de `?v=` / `?thread=` re-rendrait tout le canvas — même raison que
  // `useInitialViewportFromUrl`.
  const rawParam = useSearch({
    strict: false,
    select: (search) =>
      (search as { onboarding?: OnboardingSearchParam }).onboarding,
  });
  const navigate = useNavigate();

  const isOnboarding = isOnboardingSearchParam(rawParam);
  const isDismissed = isDismissedOnboardingSearchParam(rawParam);
  const isLoaded = flowNodes !== undefined && flowEdges !== undefined;
  const isEmpty =
    isLoaded && flowNodes.length === 0 && flowEdges.length === 0;

  // Conversation déjà désignée (envoi depuis l'onboarding, thread ouvert
  // depuis l'extérieur) : on ne (re-)entre pas, et on ne reste pas coincé sur
  // le spinner de redirection. Même rôle que `isDismissed`, pour les flux qui
  // retirent le param sans le poser explicitement à `false`.
  const hasActiveConversation = useNoleStore(
    (state) => state.activeThreadId !== null,
  );

  useEffect(() => {
    if (!isLoaded) return;
    if (
      isEmpty &&
      canAutoEnter &&
      !isOnboarding &&
      !isDismissed &&
      !hasActiveConversation
    ) {
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, onboarding: true }),
        replace: true,
      });
    } else if (!isEmpty && (isOnboarding || isDismissed)) {
      // Le canvas ne l'est plus : le param n'a plus aucun rôle, on le
      // nettoie dans les deux cas (`true` comme `false` explicite).
      void navigate({
        to: ".",
        search: (prev) => ({ ...prev, onboarding: undefined }),
        replace: true,
      });
    }
  }, [
    isLoaded,
    isEmpty,
    canAutoEnter,
    isOnboarding,
    isDismissed,
    hasActiveConversation,
    navigate,
  ]);

  return {
    isEmpty,
    isOnboarding,
    showOnboarding: isEmpty && isOnboarding,
    isRedirectPending:
      isEmpty &&
      canAutoEnter &&
      !isOnboarding &&
      !isDismissed &&
      !hasActiveConversation,
  };
}
