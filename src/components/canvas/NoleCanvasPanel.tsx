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
        // `bottom-12.5` : le bouton fait h-10 comme la toolbar, la conversation
        // le recouvrirait sinon. Pas de `canvas-ui-container` ici : c'est
        // `ChatContainer` qui porte déjà le matériau (blur + ombre).
        <div className="absolute bottom-12.5 w-95 h-[calc(100dvh-7.5rem)] animate-appear-zoom origin-bottom-left">
          <ChatContainer onClose={() => setPanelLayout("minimized")} />
        </div>
      )}
      <div className="canvas-ui-container animate-appear-up px-0!">
        {/* `h-10` : aligné sur CanvasToolbar et le dock, même rangée visuelle. */}
        <Button
          variant="ghost"
          className="h-10 rounded-lg px-3 font-bold tracking-tight"
          onClick={() => togglePanelLayout()}
        >
          <NoleIcon size={16} /> Nolë
          <Kbd>N</Kbd>
        </Button>
      </div>
    </div>
  );
}
