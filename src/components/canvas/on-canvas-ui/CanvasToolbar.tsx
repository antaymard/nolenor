import { Button } from "@/components/shadcn/button";
import type { Id } from "@/../convex/_generated/dataModel";
import { useCanvasStore } from "@/stores/canvasStore";
import SlideshowContainer from "./slideshow/SlideshowContainer";
import SlideshowProgressToolbar from "./slideshow/SlideshowProgressToolbar";
import HotspotContainer from "./hotspot/HotspotContainer";
import HotspotAltOverlay from "./hotspot/HotspotAltOverlay";
import { BiSlideshow } from "react-icons/bi";
import { TbCommand, TbGps, TbPlus, TbSearch, TbX } from "react-icons/tb";
import { Kbd } from "@/components/shadcn/kbd";
import { useCommandCenterStore } from "@/stores/commandCenterStore";
import { useSlideshowStore } from "@/stores/slideshowStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { useState } from "react";
import { useFlowPosition } from "@/hooks/useCanvasPointerPosition";
import AddBlockMenuContent from "../context-menus/AddBlockMenuContent";

export default function CanvasToolbar({
  canvasId,
}: {
  canvasId: Id<"canvases">;
}) {
  const tool = useCanvasStore((state) => state.tool);
  const setTool = useCanvasStore((state) => state.setTool);
  const isSearchModalOpen = useCanvasStore((state) => state.isSearchModalOpen);
  const toggleSearchModal = useCanvasStore((state) => state.toggleSearchModal);
  const isCommandCenterOpen = useCommandCenterStore((state) => state.isOpen);
  const toggleCommandCenter = useCommandCenterStore((state) => state.toggle);
  const isPlaying = useSlideshowStore(
    (state) => state.playback.status === "playing",
  );
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const { getViewportCenter: getViewportCenterPosition } = useFlowPosition();

  if (isPlaying) {
    return <SlideshowProgressToolbar />;
  }

  return (
    <div className="flex flex-col-reverse items-center gap-3 animate-appear-up">
      <div className="canvas-ui-container px-0!">
        <DropdownMenu open={isAddMenuOpen} onOpenChange={setIsAddMenuOpen}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <TbPlus size={20} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" sideOffset={10}>
            <AddBlockMenuContent
              getCreatePosition={getViewportCenterPosition}
              onCreated={() => setIsAddMenuOpen(false)}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        {/* <Button variant="ghost" size="icon">
          <TbUpload size={20} />
        </Button> */}
        <Button
          variant={isSearchModalOpen ? "default" : "ghost"}
          size="default"
          onClick={() => toggleSearchModal()}
        >
          <TbSearch size={20} />
          <Kbd>Ctrl + K</Kbd>
        </Button>
        <Button
          variant={isCommandCenterOpen ? "default" : "ghost"}
          size="default"
          onClick={() => toggleCommandCenter()}
          aria-label="Ouvrir le command center"
          title="Command center : aller à un canvas"
        >
          <TbCommand size={20} />
          <Kbd>Ctrl + P</Kbd>
        </Button>
        <Button
          variant={tool === "slides" ? "default" : "ghost"}
          size="icon"
          onClick={() => {
            if (tool === "slides") {
              setTool("edit");
            } else {
              setTool("slides");
            }
          }}
        >
          {tool === "slides" ? <TbX size={20} /> : <BiSlideshow size={20} />}
        </Button>
        <Button
          variant={tool === "hotspots" ? "default" : "ghost"}
          size="icon"
          onClick={() => {
            if (tool === "hotspots") {
              setTool("edit");
            } else {
              setTool("hotspots");
            }
          }}
        >
          {tool === "hotspots" ? <TbX size={20} /> : <TbGps size={20} />}
        </Button>
      </div>
      <HotspotAltOverlay />
      {tool === "slides" && <SlideshowContainer canvasId={canvasId} />}
      {tool === "hotspots" && <HotspotContainer canvasId={canvasId} />}
    </div>
  );
}
