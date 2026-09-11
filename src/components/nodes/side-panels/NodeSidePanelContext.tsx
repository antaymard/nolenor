import {
  createContext,
  useContext,
  type Dispatch,
  type SetStateAction,
} from "react";

export type NodeSidePanel = {
  id: string;
  element: React.ReactNode;
};

export type NodeContextType = {
  openSidePanels: NodeSidePanel[];
  setOpenSidePanels: Dispatch<SetStateAction<NodeSidePanel[]>>;
  closeSidePanel: (id: string) => void;
  openSidePanel: (id: string, element: React.ReactNode) => void;
};

export const NodeContext = createContext<NodeContextType>({
  openSidePanels: [],
  setOpenSidePanels: () => {},
  closeSidePanel: () => {},
  openSidePanel: () => {},
});

export function useNodeSidePanel() {
  const context = useContext(NodeContext);
  if (!context) {
    throw new Error(
      "useNodeSidePanel must be used within a NodeContext.Provider"
    );
  }
  return context;
}
