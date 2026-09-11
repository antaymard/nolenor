import { createContext, useContext } from "react";
import type { useNoleChat } from "@/hooks/useNoleChat";

type NoleChat = ReturnType<typeof useNoleChat>;

export const MobileNoleContext = createContext<NoleChat | null>(null);

export function useMobileNoleChat(): NoleChat {
  const ctx = useContext(MobileNoleContext);
  if (!ctx) {
    throw new Error("useMobileNoleChat must be used inside MobileNoleProvider");
  }
  return ctx;
}
