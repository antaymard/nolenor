import { registerSW } from "virtual:pwa-register";
import { dismissUpdateToast, showUpdateToast } from "@/components/ui/UpdateToast";
import { reportError, trackEvent } from "@/lib/analytics";

/**
 * Mise à jour de l'app après un déploiement.
 *
 * Cloudflare Pages ne sert que le manifeste du déploiement courant : les chunks
 * hachés du build précédent disparaissent de l'app à chaque mise en prod. Un
 * onglet resté sur l'ancien build lève donc « Failed to fetch dynamically
 * imported module » au premier `lazy()` — c'est ce qui cassait l'ouverture des
 * fenêtres de node.
 *
 * D'où `registerType: "prompt"` dans vite.config.ts : le nouveau service worker
 * attend au lieu de s'activer, l'ancien précache reste intact et l'onglet
 * continue de tourner sur son build jusqu'à ce que l'utilisateur accepte.
 */

let updateServiceWorker: (() => Promise<void>) | undefined;
let swRegistration: ServiceWorkerRegistration | undefined;
let hasWaitingUpdate = false;

/**
 * Où en est la mise à jour, pour l'UI (cf. `useAppUpdateStatus`).
 *
 * - `unknown` : aucune vérification lancée depuis le boot ;
 * - `checking` : on demande au serveur s'il existe un nouveau build ;
 * - `up-to-date` : rien de neuf, l'onglet tourne sur le dernier build ;
 * - `downloading` : un nouveau SW s'installe (précache du nouveau bundle) ;
 * - `ready` : le nouveau build est téléchargé et attend la bascule ;
 * - `reloading` : bascule demandée, la page va se recharger.
 */
export type AppUpdateStatus =
  | "unknown"
  | "checking"
  | "up-to-date"
  | "downloading"
  | "ready"
  | "reloading";

let status: AppUpdateStatus = "unknown";
const statusListeners = new Set<() => void>();

function setStatus(next: AppUpdateStatus): void {
  // `reloading` est terminal : la page part, aucun état intermédiaire ne doit
  // faire revenir le bouton à un état cliquable entre-temps.
  if (status === next || status === "reloading") return;
  status = next;
  statusListeners.forEach((listener) => listener());
}

export function getAppUpdateStatus(): AppUpdateStatus {
  return status;
}

export function subscribeAppUpdateStatus(listener: () => void): () => void {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

function markUpdateReady(): void {
  hasWaitingUpdate = true;
  setStatus("ready");
}

/** Clic Reload déjà pris en compte : on ignore les clics répétés. */
let reloadRequested = false;
/**
 * Clic explicite sur Reload avec bascule SW demandée. Le listener
 * `controllerchange` ci-dessous recharge dès qu'il est armé, sans passer par
 * le garde `isUpdate` de `virtual:pwa-register` (falsy sur un onglet non
 * contrôlé au boot — cas Firefox — ce qui rendait le clic inopérant).
 */
let reloadArmed = false;
/** Timeout du filet de rechargement, pour ne pas empiler les `setTimeout`. */
let reloadFallbackTimer: number | undefined;

/**
 * Délai laissé au SW en attente pour prendre la main après `SKIP_WAITING`
 * avant de recharger de force. Court mais non nul : le `controllerchange`
 * arrive normalement en quelques centaines de ms ; au-delà, c'est que le
 * message est parti dans le vide (rien en `waiting`) ou que le navigateur
 * n'a pas basculé, et garder le toast figé serait le bug « le clic ne fait
 * rien ».
 */
const RELOAD_FALLBACK_MS = 2_000;

/**
 * Recharge le build frais, pas le précache courant.
 *
 * Un simple `location.reload()` resert les bundles du service worker qui
 * contrôle l'onglet : un onglet resté sur un build décalé du backend
 * (endpoint disparu, chunk manquant) retombe alors sur le même bug. Ici, on
 * tente d'abord la bascule propre : le SW en attente prend la main et
 * recharge lui-même via le listener `controlling` posé par
 * `virtual:pwa-register`. Mais `messageSkipWaiting()` est un no-op silencieux
 * quand rien n'est en `waiting` (premier chargement non contrôlé, SW externe
 * déjà parti), et le listener `controlling` du plugin ne recharge que si
 * `event.isUpdate` — falsy quand l'onglet n'était contrôlé par rien au boot
 * (cas Firefox : `navigator.serviceWorker.controller === null`). D'où le
 * filet : si aucun `controlling` n'arrive sous `RELOAD_FALLBACK_MS`, on
 * recharge nous-mêmes. Le clic ne reste donc jamais sans effet.
 *
 * Sans SW en attente, le clic peut simplement précéder la détection du
 * déploiement : le navigateur ne revérifie `sw.js` qu'à la navigation ou
 * périodiquement, et le bandeau met quelques secondes à apparaître. Recharger
 * tout de suite resservirait l'ancien précache — l'utilisateur retombait sur
 * la même erreur et croyait l'app cassée. On force donc d'abord une
 * vérification (`checkForUpdate`), on attend la fin du téléchargement du
 * nouveau build, et seulement ensuite on bascule.
 *
 * Branché sur les reloads des error boundaries : quand la cause est un
 * déploiement, recharger n'a de sens que si l'on récupère le nouveau build.
 */
export function applyUpdate(): void {
  if (reloadRequested) return;
  reloadRequested = true;
  trackEvent("app_update.reload_click", {
    hadWaitingUpdate: hasWaitingUpdate,
    hasWaitingWorker: swRegistration?.waiting != null,
    hasController: navigator.serviceWorker?.controller != null,
  });

  if (hasWaitingUpdate && updateServiceWorker) {
    reloadViaWaitingWorker("waiting-update");
    return;
  }

  // `force` : le clic doit revérifier même juste après un « rien de neuf » —
  // le nouveau build a pu être publié entre-temps.
  void checkForUpdate({ force: true }).then((ready) => {
    if (ready && updateServiceWorker) {
      reloadViaWaitingWorker("checked-update");
      return;
    }
    // Rien de neuf côté serveur (ou pas de SW du tout) : le réseau est la
    // seule source, on recharge nous-mêmes. Pas de statut `reloading` ici :
    // il annoncerait une mise à jour qui n'existe pas.
    window.location.reload();
  });
}

/**
 * Bascule vers le SW en attente. Avec lui, c'est notre listener
 * `controllerchange` qui recharge (sans le garde `isUpdate` du plugin) ; le
 * filet garantit le reload même si la bascule n'a pas lieu.
 */
function reloadViaWaitingWorker(reason: string): void {
  reloadArmed = true;
  setStatus("reloading");
  void updateServiceWorker?.();
  armReloadFallback(reason);
}

/**
 * Évite de marteler `registration.update()` quand plusieurs écrans d'erreur
 * montent d'affilée : une vérification « rien de neuf » reste valable un
 * moment.
 */
const UPDATE_CHECK_THROTTLE_MS = 10_000;
/**
 * Plafond d'attente du téléchargement du nouveau build (précache complet).
 * Au-delà, on rend la main : le reload repartira du réseau.
 */
const DOWNLOAD_TIMEOUT_MS = 30_000;

let inFlightCheck: Promise<boolean> | undefined;
let lastCheckAt = 0;

/**
 * Demande tout de suite au navigateur s'il existe un nouveau build, et attend
 * qu'il soit téléchargé le cas échéant. Renvoie `true` si une bascule est
 * prête (SW en `waiting`).
 *
 * Appelée par les écrans d'erreur dès leur montage : une erreur juste après un
 * déploiement est très probablement un décalage front/back, et lancer le
 * téléchargement sans attendre le clic permet d'afficher un message rassurant
 * (« une mise à jour arrive ») au lieu d'une erreur.
 */
export function checkForUpdate({
  force = false,
}: { force?: boolean } = {}): Promise<boolean> {
  if (hasWaitingUpdate) return Promise.resolve(true);
  if (inFlightCheck) return inFlightCheck;
  if (
    !force &&
    status === "up-to-date" &&
    Date.now() - lastCheckAt < UPDATE_CHECK_THROTTLE_MS
  ) {
    return Promise.resolve(false);
  }
  inFlightCheck = runUpdateCheck().finally(() => {
    inFlightCheck = undefined;
    lastCheckAt = Date.now();
  });
  return inFlightCheck;
}

async function runUpdateCheck(): Promise<boolean> {
  if (!("serviceWorker" in navigator)) {
    setStatus("up-to-date");
    return false;
  }
  setStatus("checking");
  try {
    const registration =
      swRegistration ?? (await navigator.serviceWorker.getRegistration());
    if (registration) {
      swRegistration = registration;
      // `update()` se résout une fois le nouveau SW en `installing` (s'il y
      // en a un) : on peut alors suivre son téléchargement.
      if (!registration.waiting && !registration.installing) {
        await registration.update();
      }
      const installing = registration.installing;
      if (installing) {
        setStatus("downloading");
        await waitUntilInstalled(installing);
      }
    }
  } catch (error) {
    // Hors ligne, SW désactivé, `sw.js` en 404… : on retombe sur un reload
    // réseau classique.
    reportError(error, { source: "pwa.checkForUpdate" });
  }
  if (swRegistration?.waiting) {
    markUpdateReady();
    return true;
  }
  setStatus("up-to-date");
  return false;
}

/** Attend que le SW quitte `installing` (installé, ou abandonné). */
function waitUntilInstalled(worker: ServiceWorker): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      worker.removeEventListener("statechange", onStateChange);
      window.clearTimeout(timer);
      resolve();
    };
    const onStateChange = () => {
      if (worker.state !== "installing") done();
    };
    const timer = window.setTimeout(done, DOWNLOAD_TIMEOUT_MS);
    worker.addEventListener("statechange", onStateChange);
    onStateChange();
  });
}

/** Recharge de force si le SW n'a pas pris la main entre-temps. */
function armReloadFallback(reason: string): void {
  if (reloadFallbackTimer !== undefined) {
    window.clearTimeout(reloadFallbackTimer);
  }
  reloadFallbackTimer = window.setTimeout(() => {
    reloadFallbackTimer = undefined;
    // Si `controllerchange` a déjà rechargé, ce timer n'existe plus (la page
    // est partie). S'il tourne encore, la bascule n'a pas eu lieu : le
    // message est parti dans le vide ou le navigateur n'a pas basculé.
    reloadArmed = false;
    trackEvent("app_update.reload_fallback", {
      reason,
      hasWaitingWorker: swRegistration?.waiting != null,
    });
    window.location.reload();
  }, RELOAD_FALLBACK_MS);
}

let installed = false;

/** Appelé une fois au boot, depuis `main.tsx`. */
export function installAppUpdateHandlers(): void {
  if (installed) return;
  installed = true;

  // Recharge dès que le SW prend la main après un clic explicite. Sans ce
  // listener maison, seul celui de `virtual:pwa-register` rechargerait — or
  // il est gardé par `event.isUpdate`, falsy quand l'onglet n'était contrôlé
  // par rien au boot (première visite Firefox : `controller === null`), ce
  // qui rendait le clic inopérant. Ici on ne recharge que si `reloadArmed` :
  // la toute première installation du SW (premier `controllerchange` d'un
  // onglet jamais contrôlé) ne recharge donc jamais toute seule.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!reloadArmed) return;
      reloadArmed = false;
      if (reloadFallbackTimer !== undefined) {
        window.clearTimeout(reloadFallbackTimer);
        reloadFallbackTimer = undefined;
      }
      window.location.reload();
    });
  }

  updateServiceWorker = registerSW({
    immediate: true,
    // `onNeedRefresh` est appelé par `virtual:pwa-register` sur `waiting`
    // (inconditionnel) ou sur `installed` avec `isExternal`. Un SW externe —
    // autre onglet, `waiting` pré-existant déjà parti — n'a rien à nous faire
    // basculer : le clic enverrait `SKIP_WAITING` dans le vide. On n'arme le
    // bandeau « vraie mise à jour » que si un `waiting` est réellement
    // présent pour cet enregistrement ; sinon on loggue pour le diagnostic.
    onNeedRefresh() {
      void handleNeedRefresh();
    },
    onRegisteredSW(_swScriptUrl, registration) {
      swRegistration = registration;
    },
    onRegisterError(error) {
      reportError(error, { source: "pwa.register" });
    },
  });

  // Filet pour l'onglet qu'aucun service worker ne contrôle encore : là un
  // déploiement fait vraiment disparaître les chunks et rien ne nous
  // préviendra. Vite lève cet événement depuis son helper de preload, par
  // lequel passent tous les `lazy()` du build. On ne l'annule pas : l'erreur
  // doit continuer jusqu'à l'error boundary de la fenêtre, qui explique la
  // panne là où l'utilisateur regarde.
  //
  // Une erreur de preload isolée (micro-coupure, ETP, 503) n'est PAS une mise
  // à jour : le bandeau « new version » serait un faux positif, et sur un
  // onglet non contrôlé son `Reload` retomberait de toute façon sur
  // `location.reload()`. On ne l'affiche que quand il y a réellement un SW en
  // attente (vrai déploiement) ; sinon on laisse l'error boundary parler. Le
  // `dismissUpdateToast` couvre la course inverse (le preload échoue après un
  // `onNeedRefresh` sans `waiting`) : aucun bandeau mensonger ne survit.
  window.addEventListener("vite:preloadError", (event) => {
    reportError(event.payload, { source: "vite:preloadError" });
    void refreshWaitingState().then((waiting) => {
      if (waiting) {
        markUpdateReady();
        showUpdateToast(applyUpdate);
      } else {
        dismissUpdateToast();
      }
    });
  });
}

/**
 * `onNeedRefresh` du plugin (`waiting` inconditionnel ou `installed` avec
 * `isExternal`) peut arriver avant `onRegisteredSW`, ou viser un SW externe
 * déjà parti. On relit donc l'enregistrement à jour — et on laisse au
 * navigateur un tour de boucle pour installer le `waiting` qui vient
 * d'apparaître — avant de décider : bandeau de vraie mise à jour, ou simple
 * trace de diagnostic sans UI.
 */
async function handleNeedRefresh(): Promise<void> {
  const waiting = await refreshWaitingState();
  const controlledAtBoot = navigator.serviceWorker?.controller != null;
  if (waiting) {
    markUpdateReady();
    trackEvent("app_update.update_available", {
      controlledAtBoot,
    });
    showUpdateToast(applyUpdate);
  } else {
    trackEvent("app_update.spurious_need_refresh", {
      controlledAtBoot,
    });
  }
}

/**
 * Relit `registration.waiting` après un tour de boucle : `onNeedRefresh` peut
 * précéder l'état stabilisé (le SW vient de passer `installed` et n'est pas
 * encore visible en `waiting`). Renvoie `true` si une bascule est réellement
 * possible pour cet enregistrement.
 */
async function refreshWaitingState(): Promise<boolean> {
  await Promise.resolve();
  try {
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) swRegistration = registration;
    }
  } catch {
    // `getRegistration()` peut throw (navigation privée, SW désactivé) : on
    // retombe alors sur le `waiting` déjà connu, sans casser le boot.
  }
  return swRegistration?.waiting != null;
}
