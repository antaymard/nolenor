import { Button } from "@/components/shadcn/button";
import { useCanvasStore } from "@/stores/canvasStore";
import { TbCommand, TbPlus, TbSearch } from "react-icons/tb";
import { Kbd } from "@/components/shadcn/kbd";
import { useCommandCenterStore } from "@/stores/commandCenterStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { useState } from "react";
import { useFlowPosition } from "@/hooks/useCanvasPointerPosition";
import AddBlockMenuContent from "../context-menus/AddBlockMenuContent";

export default function CanvasToolbar() {
  const isSearchModalOpen = useCanvasStore((state) => state.isSearchModalOpen);
  const toggleSearchModal = useCanvasStore((state) => state.toggleSearchModal);
  const isCommandCenterOpen = useCommandCenterStore((state) => state.isOpen);
  const toggleCommandCenter = useCommandCenterStore((state) => state.toggle);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const { getViewportCenter: getViewportCenterPosition } = useFlowPosition();

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
      </div>
    </div>
  );
}
