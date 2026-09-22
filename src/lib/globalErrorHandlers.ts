import { reportError } from "@/lib/analytics";

/**
 * Handlers globaux du document principal.
 *
 * L'app n'en avait aucun : seules les iframes d'AppNode en installaient (cf.
 * `src/lib/buildSrcdoc.ts`). Résultat, tout ce qui échappe à React — une
 * promesse rejetée dans un `useEffect`, une erreur dans un listener natif —
 * disparaissait sans laisser de trace.
 *
 * On reprend la déduplication de `buildSrcdoc` : une boucle de rendu cassée
 * peut lever la même erreur des centaines de fois par seconde, et on ne veut
 * ni saturer la console ni le quota PostHog.
 */

const DEDUP_WINDOW_MS = 10_000;
const seen = new Map<string, number>();

/**
 * Bruit navigateur : des « erreurs » que le navigateur dispatche sur `window`
 * alors que l'app va bien. Il faut les écarter ici, avant `reportError()` :
 * sinon elles deviennent une issue PostHog récurrente et ininstruisible.
 *
 * `ResizeObserver loop completed with undelivered notifications.` (ancien
 * libellé Chrome : `ResizeObserver loop limit exceeded`) est prévu par la spec
 * ResizeObserver : quand un callback d'observation resalit le layout, le
 * navigateur livre les notifications restantes à la frame suivante et signale
 * la boucle au passage. Le rendu converge, rien n'est perdu. Un canvas en
 * produit forcément — React Flow observe chaque node, et nos propres observers
 * (`ImageField`, `usePdfViewport`) déclenchent des `setState` qui re-mesurent.
 *
 * Ces événements arrivent en plus sans `event.error` : le `new Error()`
 * fabriqué plus bas capture alors la stack de *ce fichier*, si bien que
 * PostHog les regroupait toutes sur `globalErrorHandlers.ts` — un compteur qui
 * monte sans jamais désigner de coupable.
 */
const IGNORED_MESSAGES = [/ResizeObserver loop/i];

function isBrowserNoise(message: string): boolean {
  return IGNORED_MESSAGES.some((pattern) => pattern.test(message));
}

function dedupKey(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return `${error.name}|${error.message}|${error.stack ?? ""}`;
  }
  return fallback;
}

function shouldReport(key: string): boolean {
  const now = Date.now();

  // Purge opportuniste : la map ne doit pas grossir indéfiniment sur une
  // session longue (le canvas reste ouvert des heures).
  for (const [k, at] of seen) {
    if (now - at > DEDUP_WINDOW_MS) seen.delete(k);
  }

  const lastSeen = seen.get(key);
  if (lastSeen !== undefined && now - lastSeen < DEDUP_WINDOW_MS) return false;

  seen.set(key, now);
  return true;
}

let installed = false;

/** Appelé une fois au boot, depuis `main.tsx`, après `initAnalytics()`. */
export function installGlobalErrorHandlers(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    if (isBrowserNoise(event.message)) return;

    const key = dedupKey(
      event.error,
      `${event.message}|${event.filename}|${event.lineno}:${event.colno}`,
    );
    if (!shouldReport(key)) return;

    reportError(event.error ?? new Error(event.message), {
      source: "window.error",
      filename: event.filename,
      line: event.lineno,
      col: event.colno,
    });
  });

  window.addEventListener("unhandledrejection", (event) => {
    const reason: unknown = event.reason;
    const key = dedupKey(reason, String(reason));
    if (!shouldReport(key)) return;

    reportError(reason, { source: "unhandledrejection" });
  });
}
