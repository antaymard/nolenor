import { createContext, useContext } from "react";

export type MobileTab = "chat" | "search" | "canvas";

export type MobileShellValue = {
  activeTab: MobileTab;
  setActiveTab: (tab: MobileTab) => void;
};

export const MobileShellContext = createContext<MobileShellValue | null>(null);

/**
 * Renvoie `null` hors du shell mobile : les composants partagés avec le desktop
 * peuvent l'appeler sans condition.
 */
export function useMobileShell(): MobileShellValue | null {
  return useContext(MobileShellContext);
}
