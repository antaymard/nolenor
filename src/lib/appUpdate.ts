import toast from "react-hot-toast";
import { reportError } from "@/lib/analytics";
import { useWindowsStore } from "@/stores/windowsStore";

/**
 * Récupération après un déploiement.
 *
 * Le build est découpé en chunks au nom haché (`BlocknoteWindow-DWKXGF06.js`),
 * chargés à la demande par les `lazy()` de `NodeWindowContent` et de
 * `WindowsContainer`. Un déploiement remplace tous ces noms d'un coup, et le
 * service worker (`registerType: "autoUpdate"`, donc `skipWaiting()` +
 * `clientsClaim()` + `cleanupOutdatedCaches()`) supprime les anciens du cache
 * dès qu'il s'active — y compris sous un onglet qui, lui, fait toujours
 * tourner l'ancien build. Le premier `import()` de cet onglet demande alors un
 * chunk qui n'existe plus ni en cache ni sur le serveur, et le fallback SPA
 * répond `index.html` : le navigateur lève
 * « Failed to fetch dynamically imported module ».
 *
 * Rien ne rattrapait ça : `React.lazy` mémorise le rejet (réessayer ne relance
 * aucune requête), l'erreur remontait jusqu'à l'error boundary et emportait
 * tout le canvas. Et comme `navigateFallback` sert l'`index.html` *précaché*,
 * un simple F5 pouvait continuer à booter l'ancien build tant que le service
 * worker n'avait pas basculé — d'où des rechargements sans effet.
 *
 * Ce module traite les deux bouts : il recharge tout seul sur la première
 * erreur de chunk, et si ça ne suffit pas il purge caches et service workers
 * avant de recharger.
 */

// Motifs des erreurs de chargement de module, tels que les formulent Chrome,
// Firefox et Safari — plus celles que Vite lève depuis son helper de preload.
const CHUNK_ERROR_PATTERNS = [
  "failed to fetch dynamically imported module",
  "error loading dynamically imported module",
  "unable to preload css",
  "importing a module script failed",
  "failed to load module script",
  "expected a javascript module script",
  "is not a valid javascript mime type",
];

/** Compteur de tentatives, en `sessionStorage` : il doit survivre au reload. */
const RECOVERY_KEY = "nolenor:chunk-recovery";
// Fenêtre pendant laquelle deux pannes comptent comme le *même* incident, donc
// pendant laquelle la seconde escalade vers la purge dure. Large exprès :
// entre deux fenêtres ouvertes il se passe facilement plusieurs minutes, et
// remettre le compteur à zéro entre-temps ferait boucler des reloads simples
// sans jamais déloger le service worker — précisément le symptôme « je
// recharge dix fois et ça ne change rien ». Au-delà, c'est un autre incident.
const RECOVERY_TTL_MS = 10 * 60_000;

const SOFT_RELOAD = 1;
const HARD_RELOAD = 2;

interface RecoveryStamp {
  step: number;
  at: number;
}

function readStamp(): RecoveryStamp | null {
  try {
    const raw = sessionStorage.getItem(RECOVERY_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as RecoveryStamp).step !== "number" ||
      typeof (parsed as RecoveryStamp).at !== "number"
    ) {
      return null;
    }
    const stamp = parsed as RecoveryStamp;
    if (Date.now() - stamp.at > RECOVERY_TTL_MS) return null;
    return stamp;
    // sessionStorage throw en navigation privée sur certains navigateurs, et
    // le JSON peut avoir été écrit par une version antérieure.
  } catch {
    return null;
  }
}

function writeStamp(step: number): void {
  try {
    sessionStorage.setItem(
      RECOVERY_KEY,
      JSON.stringify({ step, at: Date.now() } satisfies RecoveryStamp),
    );
  } catch {
    // Sans stockage on perd le garde-fou anti-boucle : on préfère quand même
    // tenter la récupération, l'utilisateur peut toujours fermer l'onglet.
  }
}

/** Est-ce un chunk manquant plutôt qu'un vrai bug applicatif ? */
export function isChunkLoadError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  if (!message) return false;

  const lower = message.toLowerCase();
  return CHUNK_ERROR_PATTERNS.some((pattern) => lower.includes(pattern));
}

/**
 * Recharger perdrait les brouillons ouverts. `dirtyNodeIds` est alimenté par
 * `useWindowFrameState`, donc il couvre exactement ce que le bouton Save
 * enverrait.
 */
function hasUnsavedWork(): boolean {
  try {
    return useWindowsStore.getState().dirtyNodeIds.length > 0;
  } catch {
    return false;
  }
}

/**
 * Purge tout ce qui peut encore servir l'ancien build : les caches du service
 * worker (dont l'`index.html` précaché que `navigateFallback` renvoie à chaque
 * navigation) et le service worker lui-même.
 */
async function clearAppCaches(): Promise<void> {
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    reportError(error, { source: "appUpdate.clearAppCaches" });
  }

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations.map((registration) => registration.unregister()),
      );
    }
  } catch (error) {
    reportError(error, { source: "appUpdate.unregisterServiceWorkers" });
  }
}

/**
 * Recharge l'app. En `hard`, purge d'abord caches et service worker : c'est la
 * seule sortie quand c'est le service worker qui sert l'ancien build, cas où
 * un F5 ordinaire tourne en rond.
 */
export async function reloadForUpdate({ hard = false } = {}): Promise<void> {
  if (hard) await clearAppCaches();
  window.location.reload();
}

let recovering = false;

/**
 * Déclenche la récupération si elle a une chance d'aboutir. Renvoie `true`
 * quand un rechargement est parti : l'appelant peut alors se taire plutôt que
 * d'afficher une erreur que l'utilisateur n'aura pas le temps de lire.
 */
export function recoverFromChunkError(): boolean {
  if (recovering) return true;

  const step = readStamp()?.step ?? 0;
  // Le reload simple puis le reload dur ont déjà été tentés : insister
  // boucherait la page en boucle. On laisse l'erreur s'afficher, avec son
  // bouton de mise à jour manuelle.
  if (step >= HARD_RELOAD) return false;
  if (hasUnsavedWork()) return false;

  recovering = true;
  // Première panne : un reload simple suffit dès que le service worker a
  // basculé. Deuxième d'affilée : c'est qu'il sert toujours l'ancien
  // `index.html`, il faut le purger.
  const nextStep = step === 0 ? SOFT_RELOAD : HARD_RELOAD;
  writeStamp(nextStep);
  void reloadForUpdate({ hard: nextStep === HARD_RELOAD });
  return true;
}

let installed = false;

/** Appelé une fois au boot, depuis `main.tsx`. */
export function installAppUpdateHandlers(): void {
  if (installed) return;
  installed = true;

  // Vite lève cet événement depuis son helper de preload, avant même que
  // l'`import()` ne rejette. `preventDefault()` empêche le rejet de remonter,
  // ce qu'on ne fait que si on part effectivement en rechargement.
  window.addEventListener("vite:preloadError", (event) => {
    reportError(event.payload, { source: "vite:preloadError" });
    if (recoverFromChunkError()) event.preventDefault();
  });

  // Filet pour les chemins qui ne passent pas par le helper de Vite : un
  // `import()` direct, ou un chunk demandé par un chunk déjà chargé.
  window.addEventListener("unhandledrejection", (event) => {
    if (!isChunkLoadError(event.reason)) return;
    if (recoverFromChunkError()) event.preventDefault();
  });

  window.addEventListener("error", (event) => {
    if (!isChunkLoadError(event.error ?? event.message)) return;
    recoverFromChunkError();
  });

  installServiceWorkerSwapHandler();
}

/**
 * Un nouveau service worker qui prend la main vient de supprimer du cache les
 * chunks que cet onglet utilise encore. Plutôt que d'attendre le premier
 * `import()` qui échouera, on repart sur le nouveau build tout de suite.
 */
function installServiceWorkerSwapHandler(): void {
  if (!("serviceWorker" in navigator)) return;

  // Sans contrôleur au boot, le `controllerchange` à venir est la toute
  // première installation : aucun build à remplacer, donc rien à recharger.
  if (!navigator.serviceWorker.controller) return;

  let swapped = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swapped) return;
    swapped = true;

    if (hasUnsavedWork()) {
      toast(
        "A new version of Nolënor is available. Save your open windows, then reload the page.",
        { id: "app-update", duration: 20_000 },
      );
      return;
    }

    void reloadForUpdate();
  });
}
