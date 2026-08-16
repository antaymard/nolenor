import { useCanvasStore } from "@/stores/canvasStore";

/**
 * Enveloppe une écriture serveur du canvas pour que `CanvasStatus` dise la
 * vérité.
 *
 * Avant ça, `canvasStore.status` n'était jamais sorti de `"idle"` : l'icône de
 * synchro affichait un nuage vert « Synced » en permanence, y compris juste
 * après l'échec d'une mutation. Sur un produit dont toute la valeur est le
 * contenu, c'est le pire mensonge possible.
 *
 * L'erreur est relancée telle quelle : les appelants ont déjà leur `catch`
 * (rollback optimiste + `toastError`), on ne fait que s'y greffer.
 */
export async function trackCanvasSync<T>(
  operation: () => Promise<T>,
): Promise<T> {
  const { beginSync, endSync } = useCanvasStore.getState();

  beginSync();
  try {
    const result = await operation();
    endSync("ok");
    return result;
  } catch (error) {
    endSync("error");
    throw error;
  }
}
