import RichTextArea from "./RichTextArea";
import { AttachmentRow } from "./chat-input/AttachmentChips";
import ComposerShell from "./chat-input/ComposerShell";
import { DirtyWindowsBadge, MicStatus } from "./chat-input/ComposerStatus";
import ModelSelect from "./chat-input/ModelSelect";
import SendStopButton from "./chat-input/SendStopButton";
import { useHasUserInput } from "@/stores/noleStore";
import type { CanvasNode } from "@/types";
import type { ChatModelOption, ChatModelValues } from "@/types/convex";

/** Le champ s'ouvre sur une ligne et grandit jusqu'à dix, puis scrolle. */
/** Quand Nolë attend une réponse, le champ du chat y répond (cf. QuestionCard). */
const ANSWER_PLACEHOLDER = "Type your answer to Nolë's question…";
const INPUT_MIN_ROWS = 1;
const INPUT_MAX_ROWS = 10;

type ChatInputProps = {
  onSend: () => void;
  isSending: boolean;
  isAssistantResponding: boolean;
  /** Nolë attend une réponse (`ask_user`) : le message tapé y répond. */
  isAwaitingAnswer?: boolean;
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
  onSend,
  isSending,
  isAssistantResponding,
  isAwaitingAnswer = false,
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
  // Booléen dérivé plutôt que le texte : il ne bascule qu'au passage vide → non
  // vide, donc ce composant et ses enfants ne re-rendent pas à chaque caractère.
  // Seul `RichTextArea` s'abonne au brouillon lui-même.
  const hasUserInput = useHasUserInput();

  // `hasDirtyWindows` n'entre volontairement pas dans `canSend` : le bouton
  // reste cliquable pour que le clic déclenche le toast qui explique le blocage,
  // signalé au passage par l'icône d'alerte et le badge.
  // Pendant une réponse, envoyer reste possible : le message part en file et
  // rejoint le run au step suivant (cf. convex/harness).
  const canSend = hasUserInput && !isSending && !sttBusy;

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
            onSubmit={onSend}
            minRows={INPUT_MIN_ROWS}
            maxRows={INPUT_MAX_ROWS}
            {...(isAwaitingAnswer ? { placeholder: ANSWER_PLACEHOLDER } : {})}
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-2 pt-1.5 pb-2">
          <div className="flex min-w-0 items-center gap-1">
            <ModelSelect
              modelOptions={modelOptions}
              selectedModel={selectedModel}
              setSelectedModel={setSelectedModel}
              disabled={isSending}
            />
            <span className="px-2.5" title="Hold Alt + Ctrl to dictate">
              <MicStatus
                isRecording={isRecording}
                isTranscribing={isTranscribing}
                level={micLevel}
              />
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {hasDirtyWindows && (
              <DirtyWindowsBadge count={dirtyNodeIds.length} />
            )}
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
