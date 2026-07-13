import {
  TbCloudExclamation,
  TbExclamationCircle,
  TbLoader,
  TbMicrophone,
  TbSend,
  TbX,
} from "react-icons/tb";
import RichTextArea from "./RichTextArea";
import SoundWaveAnimation from "./SoundWaveAnimation";
import { AttachmentRow } from "./chat-input/AttachmentChips";
import ModelSelect from "./chat-input/ModelSelect";
import { Button } from "@/components/shadcn/button";
import { Kbd } from "@/components/shadcn/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import { cn } from "@/lib/utils";
import type { CanvasNode } from "@/types";
import type { ChatModelOption, ChatModelValues } from "@/types/convex";

const INPUT_MAX_HEIGHT_PX = 182;

type ChatInputProps = {
  userInput: string;
  setUserInput: (value: string) => void;
  onSend: () => void;
  isSending: boolean;
  isAssistantResponding: boolean;
  isCancelling: boolean;
  onStopAssistantResponse: () => void | Promise<void>;
  modelOptions: readonly ChatModelOption[] | undefined;
  selectedModel: ChatModelValues | undefined;
  setSelectedModel: (model: ChatModelValues) => void;
  selectableNodes: readonly CanvasNode[];
  attachedNodes: readonly CanvasNode[];
  attachedPosition?: { x: number; y: number } | null;
  addAttachments: (args: { nodes: CanvasNode[] }) => void;
  removeAttachments: (
    items: Array<{ type: "position" } | { type: "node"; ids: string[] }>,
  ) => void;
  isRecording: boolean;
  isTranscribing: boolean;
  sttBusy: boolean;
  micLevel: number;
  dirtyNodeIds: readonly string[];
  hasDirtyWindows: boolean;
};

export default function ChatInput({
  userInput,
  setUserInput,
  onSend,
  isSending,
  isAssistantResponding,
  isCancelling,
  onStopAssistantResponse,
  modelOptions,
  selectedModel,
  setSelectedModel,
  selectableNodes,
  attachedNodes,
  attachedPosition,
  addAttachments,
  removeAttachments,
  isRecording,
  isTranscribing,
  sttBusy,
  micLevel,
  dirtyNodeIds,
  hasDirtyWindows,
}: ChatInputProps) {
  const canSend =
    !!userInput.trim() && !isAssistantResponding && !isSending && !sttBusy;

  return (
    <div className="p-2 pt-0">
      <div
        className={cn(
          "bg-slate-200 border shadow-lg rounded-lg flex flex-col gap-2 mt-2",
          hasDirtyWindows ? "border-red-300" : "border-slate-400",
        )}
      >
        <AttachmentRow
          selectableNodes={selectableNodes}
          attachedNodes={attachedNodes}
          attachedPosition={attachedPosition}
          addAttachments={addAttachments}
          removeAttachments={removeAttachments}
        />

        <div className="p-2">
          <RichTextArea
            value={userInput}
            onChange={setUserInput}
            onSubmit={onSend}
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
              triggerClassName="h-8 px-2 text-xs gap-1"
              iconSize={10}
            />
            <MicStatus
              isRecording={isRecording}
              isTranscribing={isTranscribing}
              level={micLevel}
            />
          </div>

          <div className="flex items-center gap-2">
            {hasDirtyWindows && <DirtyWindowsBadge count={dirtyNodeIds.length} />}
            {isAssistantResponding && (
              <Button
                disabled={isCancelling || isSending}
                onClick={() => void onStopAssistantResponse()}
                variant="outline"
              >
                Stop
                {isCancelling ? <TbLoader className="animate-spin" /> : <TbX />}
              </Button>
            )}
            <Button disabled={!canSend} onClick={onSend}>
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

function MicStatus({
  isRecording,
  isTranscribing,
  level,
}: {
  isRecording: boolean;
  isTranscribing: boolean;
  level: number;
}) {
  if (isRecording) {
    return (
      <div className="flex items-center gap-1.5 text-red-500 text-xs">
        <SoundWaveAnimation level={level} />
        <span>Écoute...</span>
      </div>
    );
  }
  if (isTranscribing) {
    return (
      <div className="flex items-center gap-1.5 text-slate-500 text-xs">
        <TbLoader className="animate-spin" size={14} />
        <span>Transcription...</span>
      </div>
    );
  }
  return (
    <span className="text-slate-500 text-xs">
      <TbMicrophone size={14} className="inline-block mr-1" />
      <Kbd>Alt + Ctrl</Kbd>
    </span>
  );
}

function DirtyWindowsBadge({ count }: { count: number }) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="rounded flex gap-1 bg-white/50 h-full px-2 py-1 text-red-400">
          <TbCloudExclamation size={16} className="stroke-2" />
          {count}
        </span>
      </TooltipTrigger>
      <TooltipContent className="text-sm">
        Veuillez enregistrer ou fermer les fenêtres modifiées avant d'envoyer
        votre message.
      </TooltipContent>
    </Tooltip>
  );
}
