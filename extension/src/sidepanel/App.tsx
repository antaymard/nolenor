import { useConvexAuth } from "convex/react";
import { TbLoader } from "react-icons/tb";
import LoginScreen from "./LoginScreen";
import ChatScreen from "./ChatScreen";

export default function App() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <TbLoader className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <ChatScreen />;
}