import { useCallback, type Dispatch, type SetStateAction } from "react";
import { useSpeechToText } from "@/hooks/useSpeechToText";

/**
 * Wires speech-to-text into the chat composer: transcribed text is appended to
 * the current input. Exposes recording/transcribing flags for the UI.
 */
export function useNoleSpeechInput(
  setUserInput: Dispatch<SetStateAction<string>>,
) {
  const onTranscript = useCallback(
    (text: string) =>
      setUserInput((prev) => (prev ? prev + " " + text : text)),
    [setUserInput],
  );

  const { status, start: startSTT, stop: stopSTT } = useSpeechToText(onTranscript);
  const isRecording = status === "recording";
  const isTranscribing = status === "transcribing";

  return {
    sttStatus: status,
    isRecording,
    isTranscribing,
    sttBusy: isRecording || isTranscribing,
    startSTT,
    stopSTT,
  };
}
