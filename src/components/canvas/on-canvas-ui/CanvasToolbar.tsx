import { Button } from "@/components/shadcn/button";
import { useCanvasStore } from "@/stores/canvasStore";
import {
  TbCommand,
  TbFrame,
  TbHandStop,
  TbPlus,
  TbPointer,
  TbSearch,
} from "react-icons/tb";
import { Kbd } from "@/components/shadcn/kbd";
import { ToggleGroup, ToggleGroupItem } from "@/components/shadcn/toggle-group";
import { Separator } from "@/components/shadcn/separator";
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
  const tool = useCanvasStore((state) => state.tool);
  const setTool = useCanvasStore((state) => state.setTool);
  const isCommandCenterOpen = useCommandCenterStore((state) => state.isOpen);
  const toggleCommandCenter = useCommandCenterStore((state) => state.toggle);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const { getViewportCenter: getViewportCenterPosition } = useFlowPosition();

  return (
    <div className="flex flex-col-reverse items-center gap-2 animate-appear-up">
      {/* La borne des docks latéraux (cf. `useDockCapacity`). */}
      <div className="canvas-ui-container px-0!" data-canvas-toolbar="">
        {/* Les deux façons durables de tenir le canvas, en tête de barre comme
            dans n'importe quel éditeur. `type="single"` sans valeur vide
            possible : on est toujours dans un mode — quand `frame` est actif,
            aucun des deux n'est enfoncé, ce que Radix rend en passant `value`
            à une chaîne qu'aucun item ne porte. */}
        <ToggleGroup
          type="single"
          value={tool === "hand" ? "hand" : tool === "select" ? "select" : ""}
          onValueChange={(next) => {
            // Re-cliquer l'outil actif renvoie "" : on ignore, sinon le canvas
            // se retrouverait sans mode.
            if (next === "select" || next === "hand") setTool(next);
          }}
          aria-label="Canvas tool"
        >
          <ToggleGroupItem
            value="select"
            className="h-10 w-10 rounded-lg p-0"
            aria-label="Select tool"
            title="Select, move and lasso"
          >
            <TbPointer size={19} />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="hand"
            className="h-10 w-10 rounded-lg p-0"
            aria-label="Hand tool"
            title="Hand: drag to pan the canvas"
          >
            <TbHandStop size={19} />
          </ToggleGroupItem>
        </ToggleGroup>
        <Separator orientation="vertical" className="mx-1 h-6!" />
        {/* Une frame ne se pose pas depuis le menu d'ajout : elle se trace
            autour de ce qu'elle doit contenir, donc elle a son propre mode. Le
            bouton bascule, et le mode se rend tout seul dès le tracé fini (ou
            sur Échap) — cf. `useFrameDrawTool`. */}
        <Button
          variant={tool === "frame" ? "default" : "ghost"}
          size="icon"
          className="h-10 w-10 rounded-lg"
          onClick={() => setTool(tool === "frame" ? "select" : "frame")}
          aria-pressed={tool === "frame"}
          aria-label="Draw a frame"
          title="Draw a frame to group nodes (F)"
        >
          <TbFrame size={19} />
        </Button>
        <DropdownMenu open={isAddMenuOpen} onOpenChange={setIsAddMenuOpen}>
          <DropdownMenuTrigger asChild>
            {/* `h-10 w-10` : proche des 44px tactiles, aligné sur la rangée
                Nolë + dock, avec le feedback press du matériau parent. */}
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 rounded-lg"
              aria-label="Add a block"
              title="Add a block"
            >
              <TbPlus size={19} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="center"
            sideOffset={12}
            className="rounded-xl shadow-xl"
          >
            <AddBlockMenuContent
              getCreatePosition={getViewportCenterPosition}
              onCreated={() => setIsAddMenuOpen(false)}
            />
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Les repères ont quitté la toolbar : ils vivent dans `BookmarksDock`,
            un îlot à eux posé à droite, qui reste déplié d'un canvas à l'autre
            (cf. la rangée du bas dans `routes/canvas/$canvasId.tsx`). */}
        <Separator orientation="vertical" className="mx-1 h-6!" />
        {/* <Button variant="ghost" size="icon" className="h-11 w-11">
          <TbUpload size={20} />
        </Button> */}
        <Button
          variant={isSearchModalOpen ? "default" : "ghost"}
          size="default"
          className="h-10 rounded-lg px-3"
          onClick={() => toggleSearchModal()}
        >
          <TbSearch size={19} />
          <Kbd>Ctrl + K</Kbd>
        </Button>
        <Button
          variant={isCommandCenterOpen ? "default" : "ghost"}
          size="default"
          className="h-10 rounded-lg px-3"
          onClick={() => toggleCommandCenter()}
          aria-label="Open the command center"
          title="Command center: go to a canvas"
        >
          <TbCommand size={19} />
          <Kbd>Ctrl + P</Kbd>
        </Button>
      </div>
    </div>
  );
}
