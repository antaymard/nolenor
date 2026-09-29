import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { TbMicrophone, TbWaveSine } from "react-icons/tb";
import { ThinkingOrb } from "thinking-orbs";
import { Button } from "@/components/shadcn/button";
import { Kbd } from "@/components/shadcn/kbd";
import { useNoleChat } from "@/hooks/useNoleChat";
import { usePushToTalk } from "@/hooks/usePushToTalk";
import { useHasUserInput, useNoleStore } from "@/stores/noleStore";
import { cn } from "@/lib/utils";
import RichTextArea from "../nole-panel/RichTextArea";
import SoundWaveAnimation from "../nole-panel/SoundWaveAnimation";
import ComposerShell from "../nole-panel/chat-input/ComposerShell";
import SendStopButton from "../nole-panel/chat-input/SendStopButton";
import VoiceProviderSelect from "../nole-panel/chat-input/VoiceProviderSelect";

/** Le champ héro s'ouvre sur quelques lignes et grandit jusqu'à dix. */
const INPUT_MIN_ROWS = 3;
const INPUT_MAX_ROWS = 10;

/**
 * Composer héro de l'onboarding canvas vide : les mêmes briques que le
 * composer Nolë (`ComposerShell`, `RichTextArea`, dictée, `SendStopButton`),
 * sans le choix de modèle ni les pièces jointes (canvas vide : rien à
 * mentionner ou attacher).
 *
 * À l'envoi, le thread créé par `sendCurrentMessage` est ouvert dans le panel
 * et l'onboarding se ferme — le canvas normal reprend avec la conversation en
 * cours (cf. `EmptyCanvasWithNole`).
 */
export default function OnboardingChatInput() {
  const chat = useNoleChat();
  const navigate = useNavigate();

  // Push-to-talk desktop (Ctrl+Alt maintenus), comme dans `ChatContainer`.
  usePushToTalk({ onStart: chat.startSTT, onStop: chat.stopSTT });

  // Booléen dérivé plutôt que le texte : ne bascule qu'au passage vide →
  // non vide (cf. `ChatInput`).
  const hasUserInput = useHasUserInput();

  const canSend =
    hasUserInput &&
    !chat.isAssistantResponding &&
    !chat.isSending &&
    !chat.sttBusy;

  const handleSend = useCallback(async () => {
    const createdThreadId = await chat.sendCurrentMessage();
    if (!createdThreadId) return;
    // Le message est parti : on désigne la conversation au panel, on
    // l'ouvre, et on sort de l'onboarding (`false` explicite : le canvas est
    // encore vide à cet instant et le hook ne doit pas y re-entrer).
    useNoleStore.getState().setActiveThreadId(createdThreadId);
    useNoleStore.getState().setPanelLayout("expanded");
    void navigate({
      to: ".",
      // `thread` rouvre la conversation via `useOpenThreadFromUrl` (et, sur
      // mobile, bascule sur l'onglet chat) ; `onboarding` fermé, le canvas
      // normal reprend.
      search: (prev) => ({
        ...prev,
        onboarding: false,
        thread: createdThreadId,
      }),
      replace: true,
    });
  }, [chat, navigate]);

  const handleMicToggle = useCallback(() => {
    if (chat.isRecording) chat.stopSTT();
    else void chat.startSTT();
  }, [chat]);

  return (
    <div className="w-full max-w-2xl">
      <ComposerShell
        isPulsing={chat.isAssistantResponding}
        hasDirtyWindows={false}
      >
        <div className="px-4 pt-4">
          <RichTextArea
            onSubmit={() => void handleSend()}
            minRows={INPUT_MIN_ROWS}
            maxRows={INPUT_MAX_ROWS}
            placeholder="Ask Nolë anything…"
          />
        </div>

        <div className="flex items-center justify-between gap-2 px-2 pt-1.5 pb-2">
          <div className="flex min-w-0 items-center gap-1">
            <VoiceProviderSelect disabled={chat.sttBusy}>
              <Button
                variant="ghost"
                size="sm"
                type="button"
                disabled={chat.sttBusy}
                title="Dictation engine"
                className="text-slate-500"
              >
                <MicStatus
                  isRecording={chat.isRecording}
                  isTranscribing={chat.isTranscribing}
                  level={chat.micLevel}
                />
              </Button>
            </VoiceProviderSelect>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={chat.isTranscribing || chat.isSending}
              onClick={handleMicToggle}
              title="Dictate (or hold Ctrl+Alt)"
              aria-label={
                chat.isRecording ? "Stop dictation" : "Start dictation"
              }
              className={cn(
                "size-8 rounded-full",
                chat.isRecording
                  ? "bg-red-500 text-white hover:bg-red-500/90 hover:text-white"
                  : "text-slate-500",
              )}
            >
              {chat.isTranscribing ? (
                <ThinkingOrb state="listening" size={20} />
              ) : chat.isRecording ? (
                <SoundWaveAnimation level={chat.micLevel} />
              ) : (
                <TbMicrophone size={14} className="shrink-0" />
              )}
            </Button>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <SendStopButton
              canSend={canSend}
              onSend={() => void handleSend()}
              isSending={chat.isSending}
              isAssistantResponding={chat.isAssistantResponding}
              isCancelling={chat.isCancelling}
              onStop={chat.stopAssistantResponse}
              hasDirtyWindows={false}
            />
          </div>
        </div>
      </ComposerShell>
      <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-400">
        <TbWaveSine size={12} />
        Hold Ctrl+Alt to dictate
      </p>
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
        <span>Listening...</span>
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
    <span className="flex items-center gap-1 text-xs text-slate-500">
      <TbMicrophone size={14} className="shrink-0" />
      <Kbd>Alt + Ctrl</Kbd>
    </span>
  );
}
