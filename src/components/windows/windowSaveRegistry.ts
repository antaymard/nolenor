import { useEffect, useSyncExternalStore } from "react";

/**
 * Registre central des handlers de sauvegarde des fenêtres de nodes.
 *
 * Aujourd'hui, le `Mod+S` n'est plus scopé au div de chaque fenêtre (l'ancien
 * `useHotkey` avec `target: containerRef` ratait tous les focus hors fenêtre
 * et laissait partir le save du browser). Un seul hotkey global, monté dans
 * `WindowsContainer`, résout la fenêtre au premier plan via le
 * `windowsStore` (z-order) puis appelle son handler ici.
 *
 * Les fonctions ne vont pas dans le store zustand (non sérialisable,
 * devtools) : elles vivent dans cette `Map` module, et seul un booléen
 * réactif (`a-t-on au moins un handler ?`) est exposé à React pour activer
 * ou non l'interception globale.
 */

type SaveFn = () => void;

const handlers = new Map<string, SaveFn>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Enregistre le `handleSave` d'une fenêtre. Le cleanup ne supprime l'entrée
 * que si c'est toujours la nôtre (desktop + mobile peuvent coexister
 * brièvement pour le même `xyNodeId`).
 */
export function registerWindowSaveHandler(
  xyNodeId: string,
  fn: SaveFn,
): () => void {
  handlers.set(xyNodeId, fn);
  emit();
  return () => {
    if (handlers.get(xyNodeId) === fn) {
      handlers.delete(xyNodeId);
      emit();
    }
  };
}

export function getWindowSaveHandler(xyNodeId: string): SaveFn | undefined {
  return handlers.get(xyNodeId);
}

/**
 * `true` dès qu'au moins une fenêtre expose un save. Sert de `enabled` au
 * hotkey global : sans fenêtre sauvegardable, on laisse le Ctrl+S du
 * browser tranquille (pages settings, canvas vide...).
 */
export function useHasWindowSaveHandler(): boolean {
  return useSyncExternalStore(subscribe, () => handlers.size > 0);
}

/**
 * À appeler dans le propriétaire du `handleSave` (`useWindowFrameState` et
 * `FullscreenWindowFrame`, qui duplique cet état). Ré-enregistre à chaque
 * changement d'identité pour ne jamais garder un closure stale.
 */
export function useRegisterWindowSaveHandler(
  xyNodeId: string,
  handleSave: SaveFn,
): void {
  useEffect(
    () => registerWindowSaveHandler(xyNodeId, handleSave),
    [xyNodeId, handleSave],
  );
}
