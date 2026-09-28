import NoleIcon from "@/assets/svg-components/NoleIcon";
import ChatContainer from "@/components/canvas/nole-panel/ChatContainer";
import { useNoleStore } from "@/stores/noleStore";
import { Button } from "../shadcn/button";
import { Kbd } from "../shadcn/kbd";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "../shadcn/resizable";
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
        //
        // Le resize : le groupe mesure 38rem mais la conversation n'en occupe
        // par défaut que 380px (`w-95` d'origine) ; le second panel est un
        // fantôme transparent qui donne de la marge à droite. `pointer-events-none`
        // sur le groupe et le fantôme : la zone vide au-dessus du canvas ne doit
        // pas bloquer les interactions ; seuls la conversation et la poignée
        // rattrapent les événements.
        //
        // `autoSaveId` persiste la disposition dans le localStorage (clé
        // `react-resizable-panels:nolenor:nole-panel-width`) — même compromis
        // que `canvasDockStorage` : une préférence d'espace de travail, pas un
        // champ de schéma.
        <div className="pointer-events-none absolute bottom-12.5 h-[calc(100dvh-7.5rem)] w-[38rem] origin-bottom-left animate-appear-zoom">
          <ResizablePanelGroup
            direction="horizontal"
            autoSaveId="nolenor:nole-panel-width"
            className="h-full bg-transparent!"
          >
            <ResizablePanel
              defaultSize={62.5}
              minSize={40}
              maxSize={95}
              className="pointer-events-auto rounded-xl!"
            >
              <ChatContainer onClose={() => setPanelLayout("minimized")} />
            </ResizablePanel>
            <ResizableHandle className="my-5 pointer-events-auto w-0.5 cursor-ew-resize rounded-full bg-transparent transition-colors after:hidden hover:bg-slate-300/50 data-[resize-handle-state=drag]:bg-brand" />
            <ResizablePanel
              defaultSize={37.5}
              minSize={0}
              collapsible
              className="pointer-events-none"
            />
          </ResizablePanelGroup>
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
