import { useCallback, useEffect, useRef } from "react";
import { TbCloudExclamation, TbMicrophone } from "react-icons/tb";
import { ThinkingOrb } from "thinking-orbs";
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
import ComposerShell from "@/components/canvas/nole-panel/chat-input/ComposerShell";
import ModelSelect from "@/components/canvas/nole-panel/chat-input/ModelSelect";
import SendStopButton from "@/components/canvas/nole-panel/chat-input/SendStopButton";
import { cn } from "@/lib/utils";
import { useMobileNoleChat } from "./mobileNoleContextValue";

/** Une ligne au repos ; plafonné plus bas que le desktop, le clavier virtuel
 *  mangeant déjà la moitié de l'écran. */
const INPUT_MIN_ROWS = 1;
const INPUT_MAX_ROWS = 7;

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

  // Voir ChatInput : le blocage « fenêtres modifiées » laisse le bouton actif
  // pour que le clic déclenche le toast explicatif.
  const canSend =
    !!userInput.trim() && !isAssistantResponding && !isSending && !sttBusy;

  return (
    <div className="shrink-0 p-2 pt-0">
      <ComposerShell
        isPulsing={isAssistantResponding}
        hasDirtyWindows={hasDirtyWindows}
      >
        <AttachmentRow
          selectableNodes={selectableNodes}
          attachedNodes={attachedNodes}
          attachedPosition={attachedPosition}
          addAttachments={addAttachments}
          removeAttachments={removeAttachments}
        />

        <div className="px-3 pt-2.5">
          <RichTextArea
            value={userInput}
            onChange={setUserInput}
            onSubmit={handleSend}
            minRows={INPUT_MIN_ROWS}
            maxRows={INPUT_MAX_ROWS}
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-2 pt-1.5 pb-2">
          <div className="flex items-center gap-1">
            <ModelSelect
              modelOptions={modelOptions}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              disabled={isSending || isAssistantResponding}
              triggerClassName="size-9 rounded-full"
              iconSize={16}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={isTranscribing || isSending}
              className={cn(
                "size-9 touch-none rounded-full select-none",
                isRecording
                  ? "bg-red-500 text-white hover:bg-red-500/90"
                  : "text-slate-500",
              )}
              onPointerDown={mic.onPointerDown}
              onPointerUp={mic.onPointerUp}
              onPointerCancel={mic.onPointerUp}
              onPointerLeave={mic.onPointerUp}
              aria-label="Maintenir pour dicter"
            >
              {isTranscribing ? (
                <ThinkingOrb state="listening" size={20} />
              ) : isRecording ? (
                <SoundWaveAnimation level={micLevel} />
              ) : (
                <TbMicrophone size={16} />
              )}
            </Button>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {hasDirtyWindows && (
              <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                  <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-red-500">
                    <TbCloudExclamation size={14} className="stroke-2" />
                    {dirtyNodeIds.length}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="text-sm">
                  Veuillez enregistrer ou fermer les fenêtres modifiées avant
                  d'envoyer votre message.
                </TooltipContent>
              </Tooltip>
            )}
            <SendStopButton
              canSend={canSend}
              onSend={handleSend}
              isSending={isSending}
              isAssistantResponding={isAssistantResponding}
              isCancelling={isCancelling}
              onStop={stopAssistantResponse}
              hasDirtyWindows={hasDirtyWindows}
              className="size-9"
            />
          </div>
        </div>
      </ComposerShell>
    </div>
  );
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
