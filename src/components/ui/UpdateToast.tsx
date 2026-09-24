import toast from "react-hot-toast";
import { showActionToast } from "@/components/ui/ActionToast";

const TOAST_ID = "app-update";

/**
 * Bandeau de mise à jour, en haut de l'écran et persistant.
 *
 * `duration: Infinity` parce qu'il n'y a rien à faire tant que l'utilisateur
 * n'a pas rechargé, et un `id` fixe parce que deux signaux peuvent l'ouvrir
 * (service worker en attente, chunk manquant) sans qu'on veuille deux
 * bandeaux empilés — cf. `src/lib/appUpdate.ts`.
 */
export function showUpdateToast(onReload: () => void): void {
  showActionToast({
    message: "A new version of Nolënor is available.",
    actionLabel: "Reload",
    onAction: onReload,
    id: TOAST_ID,
    duration: Infinity,
    position: "top-center",
  });
}

/**
 * Referme le bandeau de mise à jour s'il est affiché.
 *
 * `appUpdate.ts` l'appelle quand un `vite:preloadError` survient sans SW en
 * attente : c'est une erreur de chargement isolée (micro-coupure, ETP, 503),
 * pas un déploiement, et un bandeau « new version » serait un faux positif.
 */
export function dismissUpdateToast(): void {
  toast.dismiss(TOAST_ID);
}
