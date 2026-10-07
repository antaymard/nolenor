import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useReactFlow } from "@xyflow/react";
import toast from "react-hot-toast";
import { TbArrowUp, TbMicrophone, TbSparkles } from "react-icons/tb";
import { ThinkingOrb } from "thinking-orbs";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { CanvasNode } from "@/types";
import NoleIcon from "@/assets/svg-components/NoleIcon";
import { Kbd } from "@/components/shadcn/kbd";
import SoundWaveAnimation from "@/components/canvas/nole-panel/SoundWaveAnimation";
import { useNoleSpeechInput } from "@/hooks/useNoleSpeechInput";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import { cn } from "@/lib/utils";
import { getCanvasNodeTitle } from "@/lib/getCanvasNodeTitle";
import { useNoleStore } from "@/stores/noleStore";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { useTemplatesStore } from "@/stores/templatesStore";
import { useWindowsStore } from "@/stores/windowsStore";
import { generateMessageContext } from "@/components/canvas/nole-panel/messageContextGenerator";
import OmnibarFeed from "./OmnibarFeed";
import OmnibarTasks from "./OmnibarTasks";

const MAX_ROWS = 4;
const LINE_HEIGHT_PX = 20;

/**
 * L'omnibar : demander quelque chose à Nolë sans choisir de conversation.
 * Le serveur aiguille la demande vers la tâche qu'elle concerne, ou en ouvre
 * une nouvelle (cf. convex/harness/dispatch.ts). Sous la barre : où est
 * partie la dernière demande, et les tâches en cours.
 *
 * Façon Dynamic Island : au repos, une pilule de la hauteur du bouton Nolë
 * (h-10), qui dit seulement qui est là et comment lui parler. Un clic la
 * déploie en composer ; la dictée aussi, puisqu'il faut voir le texte arriver.
 * Elle se replie quand on la quitte sans rien y laisser.
 *
 * La dictée (Ctrl+Alt maintenus) marche sans focus, tant que le panel est
 * fermé : ouvert, c'est son composer qui l'écoute.
 *
 * Le composer du panel reste, pour viser une conversation précise.
 */
export default function Omnibar({ canvasId }: { canvasId: Id<"canvases"> }) {
  const text = useNoleStore((state) => state.omnibarInput);
  const setText = useNoleStore((state) => state.setOmnibarInput);
  const [sending, setSending] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const islandRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submit = useMutation(api.ia.nole.submit);
  const reactFlow = useReactFlow();
  const attachedNodes = useNoleStore((state) => state.attachedNodes);
  const attachedPosition = useNoleStore((state) => state.attachedPosition);
  const resetAttachments = useNoleStore((state) => state.resetAttachments);
  const isPanelOpen = useNoleStore((state) => state.panelLayout === "expanded");

  const speech = useNoleSpeechInput("omnibar");
  usePushToTalk({
    onStart: speech.startSTT,
    onStop: speech.stopSTT,
    enabled: !isPanelOpen,
  });
  // Pendant la dictée, l'island reste ouverte : le texte arrive dedans.
  const isExpanded = isOpen || speech.sttBusy;

  const open = () => {
    setIsOpen(true);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  // Un clic ailleurs replie l'island, sauf s'il y reste un brouillon ou une
  // dictée : on ne cache pas ce qui est en cours.
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (islandRef.current?.contains(event.target as Node)) return;
      const state = useNoleStore.getState();
      if (state.omnibarInput.trim() || speech.sttBusy) return;
      setIsOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [isOpen, speech.sttBusy]);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS * LINE_HEIGHT_PX)}px`;
  };

  // La dictée écrit le brouillon sans passer par `onChange`.
  useLayoutEffect(() => {
    if (isExpanded) resize();
  }, [text, isExpanded]);

  const send = async () => {
    const prompt = text.trim();
    if (!prompt || sending) return;

    // Le même contexte qu'un message du panel : vue, nodes ouverts, pièces
    // jointes. Lu à l'envoi.
    const nodeDatas = useNodeDataStore.getState().nodeDatas;
    const messageContext = generateMessageContext({
      nodes: reactFlow.getNodes() as CanvasNode[],
      openedNodeIds: useWindowsStore
        .getState()
        .openedWindows.map((w) => w.xyNodeId),
      attachedNodes,
      attachedPosition,
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

    setText("");
    requestAnimationFrame(resize);
    setSending(true);
    try {
      await submit({ canvasId, prompt, metadata: { messageContext } });
      resetAttachments();
    } catch (error) {
      console.error("Failed to send the request:", error);
      setText(prompt);
      toast.error("Couldn't send your request. Please try again.", {
        position: "top-center",
      });
    } finally {
      setSending(false);
    }
  };

  const canSend = text.trim().length > 0 && !sending;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={islandRef}
        className={cn(
          "canvas-ui-container overflow-hidden p-0! [interpolate-size:allow-keywords]",
          "transition-[width,border-radius,box-shadow] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
          isExpanded
            ? "w-[560px] max-w-[calc(100vw-32px)] rounded-2xl focus-within:shadow-lg"
            : "h-10 w-auto rounded-full",
        )}
      >
        {isExpanded ? (
          <div className="flex w-full items-end gap-2 px-3 py-2">
            <span className="mb-1 flex shrink-0 items-center">
              {speech.isRecording ? (
                <SoundWaveAnimation level={speech.micLevel} className="text-red-500" />
              ) : speech.isTranscribing ? (
                <ThinkingOrb state="listening" size={20} />
              ) : (
                <TbSparkles size={18} className="text-violet-500" />
              )}
            </span>
            <textarea
              ref={textareaRef}
              value={text}
              rows={1}
              onChange={(event) => {
                setText(event.target.value);
                resize();
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setIsOpen(false);
                  textareaRef.current?.blur();
                  return;
                }
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={
                speech.isRecording
                  ? "Listening…"
                  : "Ask Nolë anything — it picks the right task"
              }
              aria-label="Ask Nolë"
              className="max-h-20 min-h-[20px] flex-1 resize-none bg-transparent text-sm leading-5 text-slate-800 outline-none placeholder:text-slate-400"
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              aria-label="Send to Nolë"
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full transition-colors",
                canSend
                  ? "bg-violet-600 text-white hover:bg-violet-700"
                  : "bg-slate-100 text-slate-400",
              )}
            >
              <TbArrowUp size={16} />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={open}
            aria-label="Ask Nolë"
            className="flex h-full items-center gap-3 pr-2 pl-3.5 whitespace-nowrap"
          >
            <span className="flex items-center gap-1.5 text-sm font-bold tracking-tight">
              <NoleIcon size={16} /> Nolë
            </span>
            <span className="flex items-center gap-1 text-xs text-slate-500">
              <TbMicrophone size={14} className="shrink-0" />
              <Kbd>Alt + Ctrl</Kbd>
            </span>
          </button>
        )}
      </div>
      <OmnibarFeed canvasId={canvasId} />
      <OmnibarTasks canvasId={canvasId} />
    </div>
  );
}
