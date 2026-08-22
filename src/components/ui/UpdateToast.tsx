import toast from "react-hot-toast";
import { Button } from "@/components/shadcn/button";

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
  toast.custom(
    () => (
      <div className="flex items-center gap-3 rounded-lg border bg-popover px-4 py-2.5 text-sm text-popover-foreground shadow-lg">
        <span>A new version of Nolënor is available.</span>
        <Button size="sm" onClick={onReload}>
          Reload
        </Button>
      </div>
    ),
    { id: TOAST_ID, duration: Infinity, position: "top-center" },
  );
}
