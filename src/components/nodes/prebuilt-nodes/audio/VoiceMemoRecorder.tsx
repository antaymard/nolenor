import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import {
  TbMicrophone,
  TbPlayerStopFilled,
  TbRefresh,
  TbX,
} from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Spinner } from "@/components/shadcn/spinner";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useFileUpload } from "@/hooks/useFilesUpload";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { formatTime } from "@/hooks/useMediaPlayback";
import { toastError } from "@/components/utils/errorUtils";
import type { AudioValue } from "../AudioNode";

type Phase = "idle" | "recording" | "saving" | "error";

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
};

function memoNames(recordedAt: Date, mimeType: string) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${recordedAt.getFullYear()}-${pad(recordedAt.getMonth() + 1)}-${pad(recordedAt.getDate())}-${pad(recordedAt.getHours())}${pad(recordedAt.getMinutes())}`;
  return {
    filename: `voice-memo-${stamp}.${EXTENSIONS[mimeType] ?? "webm"}`,
    label: `Voice memo — ${recordedAt.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`,
  };
}

/**
 * Empty state of a voice memo (an audio node whose `source` is
 * "recording"): records from the
 * microphone, then fills the node exactly like an upload would, so the player,
 * the window and the transcript take over with no memo-specific code.
 *
 * The transcription starts on its own once the file is saved: a voice memo is
 * mostly read back, not listened to.
 */
function VoiceMemoRecorder({
  nodeDataId,
  compact = false,
}: {
  nodeDataId: Id<"nodeDatas"> | undefined;
  /** One-line layout for the Compact appearance (~33px high). */
  compact?: boolean;
}) {
  const { status, startRecording, stopRecording, audioBlob, reset } =
    useAudioRecorder();
  const { uploadFile } = useFileUpload();
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const transcribeAudio = useMutation(api.ia.transcription.transcribeAudio);

  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [uploadPercent, setUploadPercent] = useState(0);
  const startedAtRef = useRef(0);
  const durationRef = useRef(0);

  // Releases the microphone if the node goes away mid-recording.
  useEffect(() => reset, [reset]);

  useEffect(() => {
    if (status !== "recording") return;
    const id = window.setInterval(() => {
      setElapsed((Date.now() - startedAtRef.current) / 1000);
    }, 250);
    return () => window.clearInterval(id);
  }, [status]);

  const save = useCallback(
    async (blob: Blob) => {
      if (!nodeDataId) return;
      setPhase("saving");
      setUploadPercent(0);
      try {
        // MediaRecorder reports e.g. "audio/webm;codecs=opus": the codec
        // parameter is dropped so the type matches the upload allowlist.
        const mimeType = (blob.type.split(";")[0] || "audio/webm").trim();
        const recordedAt = new Date(startedAtRef.current);
        const { filename, label } = memoNames(recordedAt, mimeType);
        const file = new File([blob], filename, { type: mimeType });
        const uploaded = await uploadFile(file, undefined, setUploadPercent);

        // Recorded webm carries no duration header (the element reports
        // Infinity), so the measured length is written with the file.
        const audio: AudioValue = {
          ...uploaded,
          duration: durationRef.current,
          peaks: [],
          label,
          cover: null,
        };
        const saved = await updateNodeDataValues({
          nodeDataId,
          values: { audio },
        });
        if (!saved) throw new Error("The voice memo could not be saved.");

        // Best effort: on a rate limit or an unavailable STT the toolbar's
        // Transcribe button stays there to retry.
        transcribeAudio({ nodeDataId }).catch((err: unknown) => {
          console.warn("[VoiceMemoRecorder] auto-transcription failed", err);
        });
      } catch (err) {
        toastError(err, "The voice memo could not be saved.");
        setError("The voice memo could not be saved.");
        setPhase("error");
      }
    },
    [nodeDataId, transcribeAudio, updateNodeDataValues, uploadFile],
  );

  // The blob only exists once MediaRecorder has flushed its last chunk.
  const lastBlobRef = useRef<Blob | null>(null);
  useEffect(() => {
    if (!audioBlob || audioBlob === lastBlobRef.current) return;
    lastBlobRef.current = audioBlob;
    void save(audioBlob);
  }, [audioBlob, save]);

  const handleStart = useCallback(async () => {
    setError(null);
    setElapsed(0);
    try {
      await startRecording();
      startedAtRef.current = Date.now();
      setPhase("recording");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [startRecording]);

  const handleStop = useCallback(() => {
    durationRef.current = (Date.now() - startedAtRef.current) / 1000;
    stopRecording();
    setPhase("saving");
  }, [stopRecording]);

  const handleCancel = useCallback(() => {
    reset();
    setElapsed(0);
    setPhase("idle");
  }, [reset]);

  const handleRetrySave = useCallback(() => {
    if (lastBlobRef.current) void save(lastBlobRef.current);
  }, [save]);

  const stopMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  if (phase === "recording") {
    return (
      <div className="flex h-full w-full items-center justify-center gap-3 px-3">
        <span className="relative flex size-2.5 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
          <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
        </span>
        <span className="text-sm tabular-nums">{formatTime(elapsed)}</span>
        <button
          type="button"
          className="nodrag flex items-center gap-1.5 rounded-full bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
          onMouseDown={stopMouseDown}
          onClick={handleStop}
          title="Stop and save"
        >
          <TbPlayerStopFilled size={14} />
          Stop
        </button>
        <button
          type="button"
          className="nodrag text-muted-foreground hover:text-foreground"
          onMouseDown={stopMouseDown}
          onClick={handleCancel}
          title="Discard the recording"
        >
          <TbX size={16} />
        </button>
      </div>
    );
  }

  if (phase === "saving") {
    return (
      <div className="flex h-full w-full items-center justify-center gap-2 px-3 text-sm text-muted-foreground">
        <Spinner />
        <span>
          Saving…{uploadPercent > 0 && ` ${Math.round(uploadPercent)}%`}
        </span>
      </div>
    );
  }

  const canRetrySave = phase === "error" && lastBlobRef.current !== null;
  const idleLabel = canRetrySave ? "Retry saving the memo" : "Record a voice memo";

  if (compact) {
    return (
      <div className="flex h-full w-full min-w-0 items-center gap-2 px-2">
        <button
          type="button"
          className="nodrag flex size-6 shrink-0 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
          onMouseDown={stopMouseDown}
          onClick={canRetrySave ? handleRetrySave : handleStart}
          disabled={!nodeDataId}
          title={error ?? (canRetrySave ? "Retry saving" : "Start recording")}
        >
          {canRetrySave ? <TbRefresh size={13} /> : <TbMicrophone size={14} />}
        </button>
        <span
          className={`min-w-0 flex-1 truncate text-xs ${error ? "text-destructive" : ""}`}
        >
          {error ?? idleLabel}
        </span>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full min-w-0 items-center justify-center gap-3 px-3">
      <button
        type="button"
        className="nodrag flex size-10 shrink-0 items-center justify-center rounded-full bg-red-500 text-white shadow-sm hover:bg-red-600 disabled:opacity-50"
        onMouseDown={stopMouseDown}
        onClick={canRetrySave ? handleRetrySave : handleStart}
        disabled={!nodeDataId}
        title={canRetrySave ? "Retry saving" : "Start recording"}
      >
        {canRetrySave ? <TbRefresh size={18} /> : <TbMicrophone size={20} />}
      </button>
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-sm">
          {idleLabel}
        </span>
        {error ? (
          <span className="line-clamp-2 text-xs text-destructive">{error}</span>
        ) : (
          <span className="truncate text-xs text-muted-foreground">
            Transcribed automatically
          </span>
        )}
      </div>
    </div>
  );
}

export default memo(VoiceMemoRecorder);
