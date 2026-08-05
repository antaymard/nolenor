import { createContext, useContext } from "react";

export type SaveHandler = () => void | Promise<boolean | void>;

interface WindowFrameContextValue {
  setDirty: (isDirty: boolean) => void;
  setSaveHandler: (fn: SaveHandler | null) => void;
  setRefreshHandler: (fn: (() => void) | null) => void;
}

const WindowFrameContext = createContext<WindowFrameContextValue>({
  setDirty: () => {},
  setSaveHandler: () => {},
  setRefreshHandler: () => {},
});

export function useWindowFrameContext() {
  return useContext(WindowFrameContext);
}

export { WindowFrameContext };
