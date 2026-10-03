import { useEffect, useSyncExternalStore } from "react";

/**
 * Registre des handlers « ouvrir la recherche » des fenêtres de nodes, sur le
 * modèle de `windowSaveRegistry` : un seul `Mod+F` global (monté dans
 * `WindowsContainer`) vise la fenêtre au premier plan et appelle son handler,
 * d'où que vienne le focus. Sans fenêtre enregistrée, le Ctrl+F du browser
 * n'est pas intercepté.
 */

type SearchFn = () => void;

const handlers = new Map<string, SearchFn>();
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

export function getWindowSearchHandler(xyNodeId: string): SearchFn | undefined {
  return handlers.get(xyNodeId);
}

export function useHasWindowSearchHandler(): boolean {
  return useSyncExternalStore(subscribe, () => handlers.size > 0);
}

/** Le cleanup ne retire que notre propre entrée (cf. `windowSaveRegistry`). */
export function useRegisterWindowSearchHandler(
  xyNodeId: string,
  openSearch: SearchFn,
): void {
  useEffect(() => {
    handlers.set(xyNodeId, openSearch);
    emit();
    return () => {
      if (handlers.get(xyNodeId) === openSearch) {
        handlers.delete(xyNodeId);
        emit();
      }
    };
  }, [xyNodeId, openSearch]);
}
