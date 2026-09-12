import { Button } from "@/components/shadcn/button";
import { useCanvasStore } from "@/stores/canvasStore";
import { TbCommand, TbDirections, TbPlus, TbSearch } from "react-icons/tb";
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
import MarkersPanel from "../viewport-markers/MarkersPanel";

export default function CanvasToolbar() {
  const isSearchModalOpen = useCanvasStore((state) => state.isSearchModalOpen);
  const toggleSearchModal = useCanvasStore((state) => state.toggleSearchModal);
  const isCommandCenterOpen = useCommandCenterStore((state) => state.isOpen);
  const toggleCommandCenter = useCommandCenterStore((state) => state.toggle);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  // État local, comme le menu d'ajout : rien d'autre dans l'app n'a besoin
  // de savoir si la liste des repères est ouverte.
  const [isMarkersPanelOpen, setIsMarkersPanelOpen] = useState(false);
  const { getViewportCenter: getViewportCenterPosition } = useFlowPosition();

  return (
    <div className="flex flex-col-reverse items-center gap-3 animate-appear-up">
      <div className="canvas-ui-container px-0!">
        <DropdownMenu open={isAddMenuOpen} onOpenChange={setIsAddMenuOpen}>
          <DropdownMenuTrigger asChild>
            {/* `h-11 w-11` : même hauteur que le bouton Nolë (`NoleCanvasPanel`)
                et les blocs du dock, sur la même rangée visuelle. */}
            <Button variant="ghost" size="icon" className="h-11 w-11">
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
        {/* <Button variant="ghost" size="icon" className="h-11 w-11">
          <TbUpload size={20} />
        </Button> */}
        <Button
          variant={isSearchModalOpen ? "default" : "ghost"}
          size="default"
          className="h-11"
          onClick={() => toggleSearchModal()}
        >
          <TbSearch size={20} />
          <Kbd>Ctrl + K</Kbd>
        </Button>
        <Button
          variant={isCommandCenterOpen ? "default" : "ghost"}
          size="default"
          className="h-11"
          onClick={() => toggleCommandCenter()}
          aria-label="Open the command center"
          title="Command center: go to a canvas or a marker"
        >
          <TbCommand size={20} />
          <Kbd>Ctrl + P</Kbd>
        </Button>
        <Button
          variant={isMarkersPanelOpen ? "default" : "ghost"}
          size="icon"
          className="h-11 w-11"
          onClick={() => setIsMarkersPanelOpen((open) => !open)}
          aria-label="Show the navigation markers"
          aria-expanded={isMarkersPanelOpen}
          title="Navigation markers"
        >
          <TbDirections size={20} />
        </Button>
      </div>
      {/* Rendu APRÈS le `canvas-ui-container` : le wrapper est en
          `flex-col-reverse`, l'encart se pose donc au-dessus de la barre. */}
      {isMarkersPanelOpen ? (
        <MarkersPanel onClose={() => setIsMarkersPanelOpen(false)} />
      ) : null}
    </div>
  );
}
