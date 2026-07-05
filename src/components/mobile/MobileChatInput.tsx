import { useCallback, useEffect, useRef } from "react";
import {
  TbCloudExclamation,
  TbExclamationCircle,
  TbLoader,
  TbMicrophone,
  TbSend,
  TbX,
} from "react-icons/tb";
import toast from "react-hot-toast";
import { Button } from "@/components/shadcn/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import RichTextArea from "@/components/canvas/nole-panel/RichTextArea";
import SoundWaveAnimation from "@/components/canvas/nole-panel/SoundWaveAnimation";
import { AttachmentRow } from "@/components/canvas/nole-panel/chat-input/AttachmentChips";
import ModelSelect from "@/components/canvas/nole-panel/chat-input/ModelSelect";
import { cn } from "@/lib/utils";
import { useMobileNoleChat } from "./mobileNoleContextValue";

const INPUT_MAX_HEIGHT_PX = 140;
const MOBILE_INPUT_HEIGHT_VAR = "--mobile-chat-input-h";

export default function MobileChatInput() {
  const {
    userInput,
    setUserInput,
    sendCurrentMessage,
    isSending,
    isAssistantResponding,
    isCancelling,
    stopAssistantResponse,
    modelOptions,
    selectedModel,
    setSelectedModel,
    attachedNodes,
    attachedPosition,
    selectableNodes,
    addAttachments,
    removeAttachments,
    isRecording,
    isTranscribing,
    sttBusy,
    micLevel,
    startSTT,
    stopSTT,
    dirtyNodeIds,
    hasDirtyWindows,
  } = useMobileNoleChat();

  const containerRef = useRef<HTMLDivElement>(null);
  useExposeHeightAsCssVar(containerRef);

  const handleSend = useCallback(() => {
    if (hasDirtyWindows) {
      toast.error(
        "Veuillez enregistrer ou fermer les fenêtres modifiées avant d'envoyer votre message.",
        { position: "bottom-left", duration: 5000 },
      );
      return;
    }
    void sendCurrentMessage();
  }, [hasDirtyWindows, sendCurrentMessage]);

  const mic = useHoldToRecord({ startSTT, stopSTT });

  const canSend =
    !!userInput.trim() && !isAssistantResponding && !isSending && !sttBusy;

  return (
    <div ref={containerRef} className="fixed bottom-0 left-0 right-0 z-50 p-2 pt-0">
      <div
        className={cn(
          "bg-muted border shadow-md rounded-lg flex flex-col gap-2",
          hasDirtyWindows ? "border-destructive" : "border",
        )}
      >
        <AttachmentRow
          selectableNodes={selectableNodes}
          attachedNodes={attachedNodes}
          attachedPosition={attachedPosition}
          addAttachments={addAttachments}
          removeAttachments={removeAttachments}
        />

        <div className="px-2 pt-2">
          <RichTextArea
            value={userInput}
            onChange={setUserInput}
            onSubmit={handleSend}
            maxHeightPx={INPUT_MAX_HEIGHT_PX}
          />
        </div>

        <div className="flex items-center justify-between gap-2 pr-2 pb-2">
          <div className="flex items-center gap-2 pl-2">
            <ModelSelect
              modelOptions={modelOptions}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              disabled={isSending || isAssistantResponding}
              triggerClassName="h-9 w-9 px-0"
              iconSize={16}
            />
            <Button
              variant={isRecording ? "default" : "ghost"}
              size="icon"
              disabled={isTranscribing || isSending}
              className={cn(
                "h-9 w-9 select-none touch-none",
                isRecording && "bg-destructive text-white hover:bg-destructive/90",
              )}
              onPointerDown={mic.onPointerDown}
              onPointerUp={mic.onPointerUp}
              onPointerCancel={mic.onPointerUp}
              onPointerLeave={mic.onPointerUp}
              aria-label="Hold to record"
            >
              {isTranscribing ? (
                <TbLoader className="animate-spin" size={16} />
              ) : isRecording ? (
                <SoundWaveAnimation level={micLevel} />
              ) : (
                <TbMicrophone size={16} />
              )}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            {hasDirtyWindows && (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <span className="rounded flex gap-1 bg-card/50 px-2 py-1 text-destructive/70">
                    <TbCloudExclamation size={16} className="stroke-2" />
                    {dirtyNodeIds.length}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="text-sm">
                  Veuillez enregistrer ou fermer les fenêtres modifiées avant
                  d'envoyer votre message.
                </TooltipContent>
              </Tooltip>
            )}
            {isAssistantResponding && (
              <Button
                disabled={isCancelling || isSending}
                onClick={() => void stopAssistantResponse()}
                variant="outline"
                size="sm"
              >
                Stop
                {isCancelling ? <TbLoader className="animate-spin" /> : <TbX />}
              </Button>
            )}
            <Button disabled={!canSend} onClick={handleSend} size="sm">
              Send
              {isSending ? (
                <TbLoader className="animate-spin" />
              ) : hasDirtyWindows ? (
                <TbExclamationCircle />
              ) : (
                <TbSend />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Publish the composer's height as a CSS var so the chat content / node overlay
 * can pad for it while the input stays pinned above everything.
 */
function useExposeHeightAsCssVar(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const root = document.documentElement;
    const setVar = () => {
      root.style.setProperty(
        MOBILE_INPUT_HEIGHT_VAR,
        `${node.getBoundingClientRect().height}px`,
      );
    };
    setVar();
    const observer = new ResizeObserver(setVar);
    observer.observe(node);
    return () => {
      observer.disconnect();
      root.style.removeProperty(MOBILE_INPUT_HEIGHT_VAR);
    };
  }, [ref]);
}

/** Press-and-hold microphone gesture for touch devices. */
function useHoldToRecord({
  startSTT,
  stopSTT,
}: {
  startSTT: () => void | Promise<void>;
  stopSTT: () => void;
}) {
  const isActive = useRef(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (isActive.current) return;
      isActive.current = true;
      void startSTT();
    },
    [startSTT],
  );
  const onPointerUp = useCallback(() => {
    if (!isActive.current) return;
    isActive.current = false;
    stopSTT();
  }, [stopSTT]);

  // Stop recording if the component unmounts mid-gesture.
  useEffect(() => {
    return () => {
      if (isActive.current) {
        isActive.current = false;
        stopSTT();
      }
    };
  }, [stopSTT]);

  return { onPointerDown, onPointerUp };
}
