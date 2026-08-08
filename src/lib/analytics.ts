import posthog from "posthog-js";

/**
 * Point d'entrée unique vers PostHog.
 *
 * Rien d'autre dans l'app n'importe `posthog-js` directement : toutes les
 * erreurs remontent par `reportError()`, ce qui garantit un seul chemin de
 * capture (et un seul endroit à modifier si on change de destination).
 *
 * L'autocapture d'exceptions de PostHog est volontairement désactivée
 * (`capture_exceptions: false`) : les handlers globaux de
 * `src/lib/globalErrorHandlers.ts` et les ErrorBoundary appellent
 * `reportError()` eux-mêmes. Sans ça les mêmes erreurs seraient comptées
 * deux fois, et on ne pourrait pas les enrichir de contexte.
 */

// La clé projet PostHog est publique par design (elle vit dans le bundle).
// Les env vars permettent de pointer un autre projet sans toucher au code.
const POSTHOG_KEY =
  (import.meta.env.VITE_POSTHOG_KEY as string | undefined) ??
  "phc_nHUW2KSJs6rATYgiQWyMJ9zyGHTRdSn5R7yxTUnvy6tK";
const POSTHOG_HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://pt.nolenor.fr";

let isEnabled = false;

/** Appelé une fois au boot, depuis `main.tsx`. */
export function initAnalytics(): void {
  // En dev on garde la console : inutile de polluer le projet PostHog avec
  // le bruit du hot reload.
  if (import.meta.env.DEV) return;
  if (!POSTHOG_KEY || !POSTHOG_HOST) return;

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    defaults: "2026-05-30",
    capture_exceptions: false,
  });
  isEnabled = true;
}

/**
 * Rattache les événements suivants à un utilisateur. Sans ça une erreur n'est
 * imputable qu'à un navigateur anonyme, ce qui suffit rarement pour reproduire.
 */
export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>,
): void {
  if (!isEnabled) return;
  posthog.identify(userId, properties);
}

/** À la déconnexion, pour ne pas attribuer la session suivante au même user. */
export function resetAnalyticsIdentity(): void {
  if (!isEnabled) return;
  posthog.reset();
}

/**
 * Seul chemin de remontée d'erreur de l'app. Toujours loggé en console (le
 * support et le dev en ont besoin), envoyé à PostHog quand il est actif.
 *
 * Ne throw jamais : une panne d'observabilité ne doit pas casser l'app.
 */
export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  if (context) {
    console.error(error, context);
  } else {
    console.error(error);
  }

  if (!isEnabled) return;
  try {
    posthog.captureException(error, context);
  } catch {
    // Volontairement muet : si la capture échoue, on a déjà la console.
  }
}
