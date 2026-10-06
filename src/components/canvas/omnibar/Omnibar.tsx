import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useReactFlow } from "@xyflow/react";
import toast from "react-hot-toast";
import { TbArrowUp, TbSparkles } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import type { CanvasNode } from "@/types";
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
 * Le composer du panel reste, pour viser une conversation précise.
 */
export default function Omnibar({ canvasId }: { canvasId: Id<"canvases"> }) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const submit = useMutation(api.ia.nole.submit);
  const reactFlow = useReactFlow();
  const attachedNodes = useNoleStore((state) => state.attachedNodes);
  const attachedPosition = useNoleStore((state) => state.attachedPosition);
  const resetAttachments = useNoleStore((state) => state.resetAttachments);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_ROWS * LINE_HEIGHT_PX)}px`;
  };

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
    <div className="flex w-[560px] max-w-[calc(100vw-32px)] flex-col items-center gap-2">
      <div className="flex w-full items-end gap-2 rounded-2xl border border-slate-200 bg-surface px-3 py-2 shadow-md focus-within:border-violet-300 focus-within:shadow-lg">
        <TbSparkles size={18} className="mb-1 shrink-0 text-violet-500" />
        <textarea
          ref={textareaRef}
          value={text}
          rows={1}
          onChange={(event) => {
            setText(event.target.value);
            resize();
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              void send();
            }
          }}
          placeholder="Ask Nolë anything — it picks the right task"
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
      <OmnibarFeed canvasId={canvasId} />
      <OmnibarTasks canvasId={canvasId} />
    </div>
  );
}
