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
  /** Ouvre le panel latéral s'il est fermé (sans effet sinon, ni sur mobile).
   * Pour un body dont le contenu principal y vit (le transcript d'une vidéo). */
  requestSidePanelOpen: () => void;
}

const WindowFrameContext = createContext<WindowFrameContextValue>({
  setDirty: () => {},
  setSaveHandler: () => {},
  setRefreshHandler: () => {},
  setPlanTabContent: () => {},
  requestSidePanelOpen: () => {},
});

export function useWindowFrameContext() {
  return useContext(WindowFrameContext);
}

export { WindowFrameContext };
