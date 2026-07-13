import { Button } from "@/components/shadcn/button";
import type { Id } from "@/../convex/_generated/dataModel";
import { useCanvasStore } from "@/stores/canvasStore";
import SlideshowContainer from "./slideshow/SlideshowContainer";
import SlideshowProgressToolbar from "./slideshow/SlideshowProgressToolbar";
import HotspotContainer from "./hotspot/HotspotContainer";
import HotspotAltOverlay from "./hotspot/HotspotAltOverlay";
import { BiSlideshow } from "react-icons/bi";
import { TbGps, TbPlus, TbSearch, TbX } from "react-icons/tb";
import { Kbd } from "@/components/shadcn/kbd";
import { useSlideshowStore } from "@/stores/slideshowStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { useCallback, useState } from "react";
import { useViewport } from "@xyflow/react";
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
  const isPlaying = useSlideshowStore(
    (state) => state.playback.status === "playing",
  );
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const { x: canvasX, y: canvasY, zoom: canvasZoom } = useViewport();

  const getViewportCenterPosition = useCallback(() => {
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    return {
      x: (screenWidth / 2 - canvasX) / canvasZoom,
      y: (screenHeight / 2 - canvasY) / canvasZoom,
    };
  }, [canvasX, canvasY, canvasZoom]);

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
