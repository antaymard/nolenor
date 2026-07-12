import { useCallback, useRef, useState } from "react";
import { describeMicrophoneError } from "@/lib/speechErrors";

export type RecordingStatus = "idle" | "recording" | "stopped";

export interface AudioRecorderResult {
  /** Current recording status */
  status: RecordingStatus;
  /**
   * Start recording audio from the microphone.
   * Rejects with a user-displayable (French) message if the microphone is
   * unavailable or recording is unsupported; `status` stays `"idle"` then.
   */
  startRecording: () => Promise<void>;
  /** Stop recording and produce the audio blob */
  stopRecording: () => void;
  /** The assembled audio Blob after stopping, null while recording or idle */
  audioBlob: Blob | null;
  /** Reset state back to idle so a new recording can begin */
  reset: () => void;
  /** Error that occurred during recording */
  error: string | null;
}

// audio/webm n'est pas supporté partout (Safari iOS => audio/mp4) : on prend
// le premier format supporté au lieu de laisser MediaRecorder throw.
const MIME_CANDIDATES = ["audio/webm", "audio/mp4", "audio/ogg"];

function pickSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder.isTypeSupported !== "function") return undefined;
  return MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m));
}

export function useAudioRecorder(): AudioRecorderResult {
  const [status, setStatus] = useState<RecordingStatus>("idle");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setAudioBlob(null);
      chunksRef.current = [];

      if (typeof MediaRecorder === "undefined") {
        throw new Error(
          "L'enregistrement audio n'est pas supporté par ce navigateur.",
        );
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickSupportedMimeType();
      const mediaRecorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: mediaRecorder.mimeType || mimeType || "audio/webm",
        });
        setAudioBlob(blob);
        setStatus("stopped");

        // Release the microphone
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      };

      mediaRecorder.start();
      setStatus("recording");
    } catch (err) {
      // Libère un éventuel flux micro acquis avant l'échec (ex. MediaRecorder
      // qui throw) pour ne pas laisser l'indicateur micro du navigateur allumé.
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      const message =
        err instanceof Error && !(err instanceof DOMException)
          ? err.message
          : describeMicrophoneError(err);
      setError(message);
      setStatus("idle");
      throw new Error(message);
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    // Stop any ongoing recording
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    chunksRef.current = [];

    setStatus("idle");
    setAudioBlob(null);
    setError(null);
  }, []);

  return {
    status,
    startRecording,
    stopRecording,
    audioBlob,
    reset,
    error,
  };
}
