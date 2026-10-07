import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useReactFlow } from "@xyflow/react";
import toast from "react-hot-toast";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { CanvasNode } from "@/types";
import NoleIcon from "@/assets/svg-components/NoleIcon";
import { MicStatus } from "@/components/canvas/nole-panel/chat-input/ComposerStatus";
import { useNoleSpeechInput } from "@/hooks/useNoleSpeechInput";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import { cn } from "@/lib/utils";
import { getCanvasNodeTitle } from "@/lib/getCanvasNodeTitle";
import { useNoleStore } from "@/stores/noleStore";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useTemplatesStore } from "@/stores/templatesStore";
import { useWindowsStore } from "@/stores/windowsStore";
import { generateMessageContext } from "@/components/canvas/nole-panel/messageContextGenerator";
import OmnibarComposer from "./OmnibarComposer";
import OmnibarFeed from "./OmnibarFeed";
import OmnibarTasks from "./OmnibarTasks";

/**
 * L'omnibar : demander quelque chose à Nolë sans choisir de conversation.
 * Le serveur aiguille la demande vers la tâche qu'elle concerne, ou en ouvre
 * une nouvelle (cf. convex/harness/dispatch.ts). Sous la barre : où est
 * partie la dernière demande, et les tâches en cours.
 *
 * Façon Dynamic Island, deux états :
 * - compact : une pilule de la hauteur du bouton Nolë (h-10), qui dit qui est
 *   là et comment lui parler ;
 * - expanded : le composer, iso avec celui du panel (cf. OmnibarComposer).
 *   Un clic l'ouvre, Échap la replie.
 *
 * La dictée se fait en compact (la pilule montre l'écoute) ; une fois la
 * transcription rendue, l'island s'ouvre sur le texte, à relire avant envoi.
 *
 * La dictée (Ctrl+Alt maintenus) marche sans focus, tant que le panel est
 * fermé : ouvert, c'est son composer qui l'écoute.
 *
 * Le composer du panel reste, pour viser une conversation précise.
 */
export default function Omnibar({ canvasId }: { canvasId: Id<"canvases"> }) {
  const [sending, setSending] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const islandRef = useRef<HTMLDivElement>(null);
  const submit = useMutation(api.ia.nole.submit);
  const reactFlow = useReactFlow();
  const isPanelOpen = useNoleStore((state) => state.panelLayout === "expanded");

  const speech = useNoleSpeechInput("omnibar");
  usePushToTalk({
    onStart: speech.startSTT,
    onStop: speech.stopSTT,
    enabled: !isPanelOpen,
  });

  const collapse = () => {
    setIsExpanded(false);
    const active = document.activeElement;
    if (active instanceof HTMLElement && islandRef.current?.contains(active)) {
      active.blur();
    }
  };

  // Fin d'une dictée : l'island s'ouvre sur le texte transcrit, curseur à la
  // fin. Rien de reconnu, elle reste compacte (la dictée l'a déjà signalé).
  const wasBusyRef = useRef(false);
  useEffect(() => {
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = speech.sttBusy;
    if (!wasBusy || speech.sttBusy) return;
    if (!useNoleStore.getState().omnibarInput.trim()) return;
    setIsExpanded(true);
    requestAnimationFrame(() => {
      const el = islandRef.current?.querySelector("textarea");
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    });
  }, [speech.sttBusy]);

  const send = async () => {
    const state = useNoleStore.getState();
    const prompt = state.omnibarInput.trim();
    if (!prompt || sending || speech.sttBusy) return;

    // Même blocage que le panel : le contexte décrirait des nodes dont le
    // contenu n'est pas encore enregistré.
    if (useWindowsStore.getState().dirtyNodeIds.length > 0) {
      toast.error(
        "Please save or close the modified windows before sending your request.",
        { position: "top-center", duration: 5000 },
      );
      return;
    }

    // Le même contexte qu'un message du panel : vue, nodes ouverts, pièces
    // jointes. Lu à l'envoi.
    const nodeDatas = useNodeDataStore.getState().nodeDatas;
    const messageContext = generateMessageContext({
      nodes: reactFlow.getNodes() as CanvasNode[],
      openedNodeIds: useWindowsStore
        .getState()
        .openedWindows.map((w) => w.xyNodeId),
      attachedNodes: state.attachedNodes,
      attachedPosition: state.attachedPosition,
      viewport: reactFlow.getViewport(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      getNodeTitle: (node) =>
        getCanvasNodeTitle(
          node,
          nodeDatas,
          useTemplatesStore.getState().templates,
        ),
    });

    // Envoyée, la demande quitte l'island : elle repart en compact, et la
    // suite se lit dessous (feed, tâches).
    state.setOmnibarInput("");
    collapse();
    setSending(true);
    try {
      await submit({
        canvasId,
        prompt,
        metadata: {
          messageContext,
          ...(state.omnibarModel ? { model: state.omnibarModel } : {}),
        },
      });
      state.resetAttachments();
    } catch (error) {
      console.error("Failed to send the request:", error);
      // Rouverte sur le texte, pour réessayer.
      state.setOmnibarInput(prompt);
      setIsExpanded(true);
      toast.error("Couldn't send your request. Please try again.", {
        position: "top-center",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={islandRef}
        onKeyDown={(event) => {
          // Échap ferme d'abord le menu des mentions : react-mentions arrête
          // alors la propagation, et l'island ne le voit pas.
          if (event.key === "Escape" && isExpanded) {
            event.preventDefault();
            collapse();
          }
        }}
        className={cn(
          "canvas-ui-container overflow-hidden p-0! [interpolate-size:allow-keywords]",
          "transition-[width,border-radius,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isExpanded
            ? "w-[560px] max-w-[calc(100vw-32px)] rounded-2xl focus-within:shadow-lg"
            : "h-10 w-auto rounded-full",
        )}
      >
        {isExpanded ? (
          <OmnibarComposer
            onSend={() => void send()}
            isSending={sending}
            isRecording={speech.isRecording}
            isTranscribing={speech.isTranscribing}
            sttBusy={speech.sttBusy}
            micLevel={speech.micLevel}
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            aria-label="Ask Nolë"
            className="flex h-full items-center gap-3 pr-2 pl-3.5 whitespace-nowrap"
          >
            <span className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
              <NoleIcon size={16} /> Nolë
            </span>
            <MicStatus
              isRecording={speech.isRecording}
              isTranscribing={speech.isTranscribing}
              level={speech.micLevel}
            />
          </button>
        )}
      </div>
      <OmnibarFeed canvasId={canvasId} />
      <OmnibarTasks canvasId={canvasId} />
    </div>
  );
}
