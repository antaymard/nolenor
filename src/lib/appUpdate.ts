import { registerSW } from "virtual:pwa-register";
import { showUpdateToast } from "@/components/ui/UpdateToast";
import { reportError } from "@/lib/analytics";

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
 * continue de tourner sur son build jusqu'à ce que l'utilisateur accepte. Tout
 * le reste — workbox-window, skipWaiting, rechargement à la prise de contrôle —
 * vient de `virtual:pwa-register` ; il ne reste ici qu'à ouvrir le bandeau.
 */

let updateServiceWorker: (() => Promise<void>) | undefined;
let hasWaitingUpdate = false;

function applyUpdate(): void {
  // Avec un service worker en attente, c'est lui qui recharge la page en
  // prenant la main (listener posé par `virtual:pwa-register`). Sans lui —
  // onglet d'une première visite, que rien ne contrôle encore — il n'y a que
  // le réseau, donc on recharge nous-mêmes.
  if (hasWaitingUpdate && updateServiceWorker) {
    void updateServiceWorker();
    return;
  }
  window.location.reload();
}

let installed = false;

/** Appelé une fois au boot, depuis `main.tsx`. */
export function installAppUpdateHandlers(): void {
  if (installed) return;
  installed = true;

  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh() {
      hasWaitingUpdate = true;
      showUpdateToast(applyUpdate);
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
  window.addEventListener("vite:preloadError", (event) => {
    reportError(event.payload, { source: "vite:preloadError" });
    showUpdateToast(applyUpdate);
  });
}
