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
        <div className="absolute bottom-10 canvas-ui-container p-0! w-95 h-[calc(100dvh-6rem)] animate-appear-zoom origin-bottom-left">
          <ChatContainer onClose={() => setPanelLayout("minimized")} />
        </div>
      )}
      <div className="canvas-ui-container px-0! animate-appear-up">
        <Button variant="ghost" onClick={() => togglePanelLayout()}>
          <NoleIcon /> Nolë
          <Kbd>N</Kbd>
        </Button>
      </div>
    </div>
  );
}
