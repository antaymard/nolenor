import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import RichTextArea from "@/components/canvas/nole-panel/RichTextArea";
import { AttachmentRow } from "@/components/canvas/nole-panel/chat-input/AttachmentChips";
import {
  DirtyWindowsBadge,
  MicStatus,
} from "@/components/canvas/nole-panel/chat-input/ComposerStatus";
import ModelSelect from "@/components/canvas/nole-panel/chat-input/ModelSelect";
import SendStopButton from "@/components/canvas/nole-panel/chat-input/SendStopButton";
import { useSelectableNodes } from "@/hooks/useSelectableNodes";
import { useHasUserInput, useNoleStore } from "@/stores/noleStore";
import { useWindowsStore } from "@/stores/windowsStore";

/** Plus court que le panel (dix lignes) : l'island flotte sur le canvas. */
const INPUT_MAX_ROWS = 6;

type OmnibarComposerProps = {
  onSend: () => void;
  isSending: boolean;
  isRecording: boolean;
  isTranscribing: boolean;
  sttBusy: boolean;
  micLevel: number;
};

/**
 * L'island déployée : le composer du panel, mêmes briques et même
 * comportement — pièces jointes, mentions `@`, choix du modèle, dictée,
 * fenêtres non enregistrées. Seuls changent le brouillon (`omnibar`) et
 * l'absence de stop : une demande sans conversation n'a pas de run à arrêter.
 *
 * Les pièces jointes sont celles du panel (le store Nolë n'en a qu'un jeu) :
 * Alt + clic attache un node à la prochaine demande, d'où qu'elle parte.
 */
export default function OmnibarComposer({
  onSend,
  isSending,
  isRecording,
  isTranscribing,
  sttBusy,
  micLevel,
}: OmnibarComposerProps) {
  const hasInput = useHasUserInput("omnibar");

  const attachedNodes = useNoleStore((state) => state.attachedNodes);
  const attachedPosition = useNoleStore((state) => state.attachedPosition);
  const addAttachments = useNoleStore((state) => state.addAttachments);
  const removeAttachments = useNoleStore((state) => state.removeAttachments);
  const selectableNodes = useSelectableNodes(attachedNodes);

  // Pas de thread pour en hériter le modèle : sans choix explicite, la
  // demande part sans modèle et le serveur prend le défaut du profil. Le
  // sélecteur coche alors le premier, qui est ce défaut.
  const modelOptions = useQuery(api.ia.nole.listChatModels, {});
  const omnibarModel = useNoleStore((state) => state.omnibarModel);
  const setOmnibarModel = useNoleStore((state) => state.setOmnibarModel);
  const selectedModel = omnibarModel ?? modelOptions?.[0]?.value;

  const dirtyNodeIds = useWindowsStore((state) => state.dirtyNodeIds);
  const hasDirtyWindows = dirtyNodeIds.length > 0;

  // Comme le panel : `hasDirtyWindows` laisse le bouton cliquable, pour que
  // le clic explique le blocage.
  const canSend = hasInput && !isSending && !sttBusy;

  return (
    <div className="flex w-full flex-col">
      <AttachmentRow
        selectableNodes={selectableNodes}
        attachedNodes={attachedNodes}
        attachedPosition={attachedPosition}
        addAttachments={addAttachments}
        removeAttachments={removeAttachments}
      />

      <div className="px-3 pt-2.5">
        <RichTextArea
          draft="omnibar"
          onSubmit={onSend}
          maxRows={INPUT_MAX_ROWS}
          suggestionsPlacement="below"
          placeholder="Ask Nolë anything, @ to mention a node"
        />
      </div>

      <div className="flex items-center justify-between gap-2 px-2 pt-1.5 pb-2">
        <div className="flex min-w-0 items-center gap-1">
          <ModelSelect
            modelOptions={modelOptions}
            selectedModel={selectedModel}
            setSelectedModel={setOmnibarModel}
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
          {hasDirtyWindows && <DirtyWindowsBadge count={dirtyNodeIds.length} />}
          <SendStopButton
            canSend={canSend}
            onSend={onSend}
            isSending={isSending}
            isAssistantResponding={false}
            isCancelling={false}
            onStop={() => {}}
            hasDirtyWindows={hasDirtyWindows}
          />
        </div>
      </div>
    </div>
  );
}
