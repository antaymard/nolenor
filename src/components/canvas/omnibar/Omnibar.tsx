import { useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useReactFlow } from "@xyflow/react";
import toast from "react-hot-toast";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { CanvasNode } from "@/types";
import NoleIcon from "@/assets/svg-components/NoleIcon";
import { MicStatus } from "@/components/canvas/nole-panel/chat-input/ComposerStatus";
import ThreadSelector from "@/components/canvas/nole-panel/ThreadSelector";
import { useNoleSpeechInput } from "@/hooks/useNoleSpeechInput";
import { useOpenNoleThread } from "@/hooks/useOpenNoleThread";
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
 * une nouvelle (cf. convex/harness/dispatch.ts). Au-dessus de l'island : où
 * est partie la dernière demande, et les tâches en cours.
 *
 * Elle tient le coin bas-gauche, à la place de l'ancien bouton Nolë. Quand la
 * conversation (panel) est ouverte, elle flotte au même endroit : l'island
 * reste compacte et le stack s'efface ; un clic sur l'island ferme le panel.
 *
 * Façon Dynamic Island, deux états :
 * - compact : une pilule de la hauteur du bouton Nolë (h-10), qui dit qui est
 *   là et comment lui parler ;
 * - expanded : le composer, iso avec celui du panel (cf. OmnibarComposer).
 *   Un clic l'ouvre, Échap la replie.
 *
 * La dictée ouvre l'island : le texte s'y inscrit en direct, et reste à
 * relire avant envoi. Rien de reconnu, elle revient en compact si c'est la
 * dictée qui l'avait ouverte.
 *
 * La dictée (Ctrl+Alt maintenus) marche sans focus, tant que le panel est
 * fermé : ouvert, c'est son composer qui l'écoute.
 *
 * Le composer du panel reste, pour viser une conversation précise.
 */
export default function Omnibar({ canvasId }: { canvasId: Id<"canvases"> }) {
  const [sending, setSending] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  // Lu par l'effet de la dictée sans en faire une dépendance : il ne doit
  // réagir qu'au début et à la fin d'une dictée.
  const isExpandedRef = useRef(isExpanded);
  isExpandedRef.current = isExpanded;
  const islandRef = useRef<HTMLDivElement>(null);
  const submit = useMutation(api.ia.nole.submit);
  const reactFlow = useReactFlow();
  const isPanelOpen = useNoleStore((state) => state.panelLayout === "expanded");
  const activeThreadId = useNoleStore((state) => state.activeThreadId);
  const openThread = useOpenNoleThread();

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

  // Un clic ailleurs replie l'island si elle est vide ; un brouillon ou une
  // dictée en cours la gardent ouverte. Les menus portés hors de l'island
  // (modèle, mentions) comptent comme dedans : choisir un modèle ne la
  // replie pas.
  useEffect(() => {
    if (!isExpanded) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (islandRef.current?.contains(target)) return;
      if (target.closest("[data-radix-popper-content-wrapper]")) return;
      if (useNoleStore.getState().omnibarInput.trim() || speech.sttBusy) return;
      setIsExpanded(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isExpanded, speech.sttBusy]);

  // Le panel s'ouvre (N, une tâche ouverte) : il prend la place, l'island se
  // replie.
  useEffect(() => {
    if (isPanelOpen) setIsExpanded(false);
  }, [isPanelOpen]);

  // La dictée ouvre l'island pour qu'on y voie le texte arriver. À la fin,
  // curseur après le texte ; rien de reconnu, elle revient en compact si
  // c'est la dictée qui l'avait ouverte (la dictée l'a déjà signalé).
  const wasBusyRef = useRef(false);
  const openedByDictationRef = useRef(false);
  useEffect(() => {
    const wasBusy = wasBusyRef.current;
    wasBusyRef.current = speech.sttBusy;
    if (!wasBusy && speech.sttBusy) {
      openedByDictationRef.current = !isExpandedRef.current;
      setIsExpanded(true);
      return;
    }
    if (!wasBusy || speech.sttBusy) return;
    if (!useNoleStore.getState().omnibarInput.trim()) {
      if (openedByDictationRef.current) setIsExpanded(false);
      return;
    }
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
        { position: "bottom-left", duration: 5000 },
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
    // suite se lit au-dessus (feed, tâches).
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
        position: "bottom-left",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      {!isPanelOpen && (
        <div className="flex w-[560px] max-w-[calc(100vw-32px)] flex-col items-start gap-2">
          <OmnibarTasks canvasId={canvasId} />
          <OmnibarFeed canvasId={canvasId} />
        </div>
      )}
      <div className="flex items-end gap-2">
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
              onDiscard={() => {
                // Le prompt seulement : les pièces jointes sont partagées avec
                // le panel, et le choix du modèle vaut pour la suite.
                useNoleStore.getState().setOmnibarInput("");
                collapse();
              }}
              isSending={sending}
              isRecording={speech.isRecording}
              isTranscribing={speech.isTranscribing}
              sttBusy={speech.sttBusy}
              micLevel={speech.micLevel}
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                useNoleStore.getState().setPanelLayout("minimized");
                setIsExpanded(true);
              }}
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
        {/* L'historique des conversations du canvas : en choisir une l'ouvre
          dans le panel. */}
        <div className="canvas-ui-container h-10 rounded-full p-0!">
          <ThreadSelector
            canvasId={canvasId}
            currentThreadId={activeThreadId}
            onSelectThread={openThread}
            side="top"
            triggerClassName="size-10 rounded-full text-slate-500 hover:text-slate-800"
          />
        </div>
      </div>
    </div>
  );
}
