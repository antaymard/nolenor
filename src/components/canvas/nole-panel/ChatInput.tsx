import { TbCloudExclamation, TbMicrophone } from "react-icons/tb";
import { ThinkingOrb } from "thinking-orbs";
import RichTextArea from "./RichTextArea";
import SoundWaveAnimation from "./SoundWaveAnimation";
import { AttachmentRow } from "./chat-input/AttachmentChips";
import ComposerShell from "./chat-input/ComposerShell";
import ModelSelect from "./chat-input/ModelSelect";
import SendStopButton from "./chat-input/SendStopButton";
import { Kbd } from "@/components/shadcn/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/shadcn/tooltip";
import type { CanvasNode } from "@/types";
import type { ChatModelOption, ChatModelValues } from "@/types/convex";

/** Le champ s'ouvre sur une ligne et grandit jusqu'à dix, puis scrolle. */
const INPUT_MIN_ROWS = 1;
const INPUT_MAX_ROWS = 10;

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
  // `hasDirtyWindows` n'entre volontairement pas dans `canSend` : le bouton
  // reste cliquable pour que le clic déclenche le toast qui explique le blocage,
  // signalé au passage par l'icône d'alerte et le badge.
  const canSend =
    !!userInput.trim() && !isAssistantResponding && !isSending && !sttBusy;

  return (
    <div className="p-2 pt-0">
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
            onSubmit={onSend}
            minRows={INPUT_MIN_ROWS}
            maxRows={INPUT_MAX_ROWS}
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-2 pt-1.5 pb-2">
          <div className="flex min-w-0 items-center gap-1">
            <ModelSelect
              modelOptions={modelOptions}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              disabled={isSending || isAssistantResponding}
              triggerClassName="size-8 rounded-full"
              iconSize={14}
            />
            <MicStatus
              isRecording={isRecording}
              isTranscribing={isTranscribing}
              level={micLevel}
            />
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {hasDirtyWindows && <DirtyWindowsBadge count={dirtyNodeIds.length} />}
            <SendStopButton
              canSend={canSend}
              onSend={onSend}
              isSending={isSending}
              isAssistantResponding={isAssistantResponding}
              isCancelling={isCancelling}
              onStop={onStopAssistantResponse}
              hasDirtyWindows={hasDirtyWindows}
            />
          </div>
        </div>
      </ComposerShell>
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
      <span className="flex items-center gap-1.5 text-xs text-red-500">
        <SoundWaveAnimation level={level} />
        <span>Écoute…</span>
      </span>
    );
  }
  if (isTranscribing) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-slate-500">
        <ThinkingOrb state="listening" size={20} />
        <span>Transcription…</span>
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-xs text-slate-400">
      <TbMicrophone size={14} className="shrink-0" />
      <Kbd>Alt + Ctrl</Kbd>
    </span>
  );
}

function DirtyWindowsBadge({ count }: { count: number }) {
  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="flex items-center gap-1 rounded-full bg-red-50 px-2 py-1 text-red-500">
          <TbCloudExclamation size={14} className="stroke-2" />
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
