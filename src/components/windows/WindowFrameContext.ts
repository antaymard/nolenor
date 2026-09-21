import { createContext, useContext, type ReactNode } from "react";

export type SaveHandler = () => void | Promise<boolean | void>;

interface WindowFrameContextValue {
  setDirty: (isDirty: boolean) => void;
  setSaveHandler: (fn: SaveHandler | null) => void;
  setRefreshHandler: (fn: (() => void) | null) => void;
  /** Contenu de l'onglet Plan du panel latéral, publié par le body de la
   * window (seul détenteur des refs/queries propres à son type). `null` =
   * rien à montrer, le panel retombe sur son état vide générique. */
  setPlanTabContent: (node: ReactNode | null) => void;
}

const WindowFrameContext = createContext<WindowFrameContextValue>({
  setDirty: () => {},
  setSaveHandler: () => {},
  setRefreshHandler: () => {},
  setPlanTabContent: () => {},
});

export function useWindowFrameContext() {
  return useContext(WindowFrameContext);
}

export { WindowFrameContext };
