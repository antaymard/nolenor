import { useCallback, useEffect, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useAudioRecorder } from "./useAudioRecorder";

export type SpeechToTextStatus = "idle" | "recording" | "transcribing";

/**
 * Speech-to-text batch : enregistre au micro (MediaRecorder), puis envoie le
 * blob complet à Convex (Mistral Voxtral) au relâchement.
 *
 * `onTranscript` reçoit le texte transcrit, éventuellement vide si aucune
 * parole n'a été détectée (au caller d'en informer l'utilisateur).
 * `onError` reçoit un message affichable (FR) : micro inaccessible ou échec de
 * transcription — plus aucune erreur n'est avalée en silence.
 */
export function useSpeechToText(
  onTranscript: (text: string) => void,
  onError?: (message: string) => void,
) {
  const {
    status: recorderStatus,
    startRecording,
    stopRecording,
    audioBlob,
    reset,
  } = useAudioRecorder();
  const transcribe = useAction(api.speech.transcribe);

  const [status, setStatus] = useState<SpeechToTextStatus>("idle");
  const isTranscribingRef = useRef(false);
  // Relâchement pendant l'acquisition micro : on retient le stop et on
  // l'applique dès que l'enregistrement démarre (sinon micro jamais coupé).
  const stopRequestedRef = useRef(false);

  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  // Start recording when called
  const start = useCallback(async () => {
    if (status !== "idle") return;
    stopRequestedRef.current = false;
    setStatus("recording");
    try {
      await startRecording();
      if (stopRequestedRef.current) {
        stopRequestedRef.current = false;
        stopRecording();
      }
    } catch (err) {
      console.error("Recording failed:", err);
      setStatus("idle");
      onErrorRef.current?.(
        err instanceof Error
          ? err.message
          : "Impossible d'accéder au microphone.",
      );
    }
  }, [status, startRecording, stopRecording]);

  // Stop recording - transcription will happen via the effect below
  const stop = useCallback(() => {
    if (recorderStatus === "recording") {
      stopRecording();
    } else if (status === "recording") {
      // getUserMedia encore en cours : le start() coupera dès que possible.
      stopRequestedRef.current = true;
    }
  }, [recorderStatus, status, stopRecording]);

  // When audioBlob is available after stopping, send it for transcription
  useEffect(() => {
    if (!audioBlob || isTranscribingRef.current) return;

    isTranscribingRef.current = true;
    setStatus("transcribing");

    const doTranscribe = async () => {
      try {
        const arrayBuffer = await audioBlob.arrayBuffer();
        const result = await transcribe({
          audio: arrayBuffer,
          mimeType: audioBlob.type || undefined,
        });
        onTranscript(result.text.trim());
      } catch (err) {
        console.error("Transcription failed:", err);
        onErrorRef.current?.("La transcription a échoué. Réessayez.");
      } finally {
        isTranscribingRef.current = false;
        setStatus("idle");
        reset();
      }
    };

    void doTranscribe();
  }, [audioBlob, transcribe, onTranscript, reset]);

  return { status, start, stop };
}
