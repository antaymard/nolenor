import { Button } from "@/components/shadcn/button";
import { HiOutlineCog } from "react-icons/hi";
import { Link } from "@tanstack/react-router";
import { memo } from "react";
import { useConvexAuth } from "convex/react";
import SharingModal from "./SharingModal";
import CanvasStatus from "./CanvasStatus";

function TopRightToolbar() {
  const { isAuthenticated } = useConvexAuth();
  if (!isAuthenticated) return null;

  return (
    <div className="canvas-ui-container animate-appear-down">
      <div className="px-2">
        <CanvasStatus />
      </div>
      <SharingModal />
      <Button variant="ghost" size="icon-sm" asChild>
        <Link
          to="/settings"
          className="hover:bg-accent flex items-center rounded-md"
          title="Settings"
        >
          <HiOutlineCog size={18} />
        </Link>
      </Button>
    </div>
  );
}

export default memo(TopRightToolbar);
