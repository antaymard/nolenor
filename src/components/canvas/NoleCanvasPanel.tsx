import NoleIcon from "@/assets/svg-components/NoleIcon";
import ChatContainer from "@/components/canvas/nole-panel/ChatContainer";
import { useNoleStore } from "@/stores/noleStore";
import { Button } from "../shadcn/button";
import { Kbd } from "../shadcn/kbd";
import { useHotkey } from "@tanstack/react-hotkeys";

export default function NoleCanvasPanel() {
  const layout = useNoleStore((state) => state.panelLayout);
  const setPanelLayout = useNoleStore((state) => state.setPanelLayout);
  const togglePanelLayout = useNoleStore((state) => state.togglePanelLayout);

  useHotkey("N", () => togglePanelLayout());

  return (
    <div className="relative">
      {layout === "expanded" && (
        // `bottom-14` et non `bottom-10` : le bouton a grandi pour s'aligner
        // sur les blocs du dock, et la conversation le recouvrait.
        <div className="absolute bottom-12.5 canvas-ui-container p-0! w-95 h-[calc(100dvh-6.5rem)] animate-appear-zoom origin-bottom-left">
          <ChatContainer onClose={() => setPanelLayout("minimized")} />
        </div>
      )}
      <div className="canvas-ui-container px-0! animate-appear-up">
        {/* `h-11` : le bouton et les blocs du dock sont sur la même rangée et
            doivent faire la même hauteur. */}
        <Button
          variant="ghost"
          className="h-11"
          onClick={() => togglePanelLayout()}
        >
          <NoleIcon /> Nolë
          <Kbd>N</Kbd>
        </Button>
      </div>
    </div>
  );
}
