import { type ReactNode } from "react";
import { useNoleChat } from "@/hooks/useNoleChat";
import { MobileNoleContext } from "./mobileNoleContextValue";

export function MobileNoleProvider({ children }: { children: ReactNode }) {
  const chat = useNoleChat();
  return (
    <MobileNoleContext.Provider value={chat}>
      {children}
    </MobileNoleContext.Provider>
  );
}
