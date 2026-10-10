import { Button } from "@/components/shadcn/button";
import { HiOutlineCog } from "react-icons/hi";
import { memo } from "react";
import { useConvexAuth } from "convex/react";
import SharingModal from "./SharingModal";
import TrashModal from "./TrashModal";
import CanvasStatus from "./CanvasStatus";
import CanvasPresence from "./CanvasPresence";
import { useSettingsModalStore } from "@/stores/settingsModalStore";

function TopRightToolbar() {
  const { isAuthenticated } = useConvexAuth();
  const openSettings = useSettingsModalStore((state) => state.open);
  if (!isAuthenticated) return null;

  return (
    <div className="canvas-ui-container animate-appear-down px-1!">
      <div className="flex h-8 items-center gap-2 px-2">
        <CanvasPresence />
        <CanvasStatus />
      </div>
      <TrashModal />
      <SharingModal />
      {/* En modale : le canvas reste monté dessous (cf. SettingsModal). */}
      <Button
        variant="ghost"
        size="icon-sm"
        className="hover:bg-accent rounded-lg"
        onClick={() => openSettings()}
        title="Settings"
        aria-label="Settings"
      >
        <HiOutlineCog size={18} />
      </Button>
    </div>
  );
}

export default memo(TopRightToolbar);
