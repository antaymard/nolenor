import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { MAX_TRANSCRIPTION_BYTES } from "@/../convex/config/transcriptionConfig";
import { useNodeData, useNodeDataValuesField } from "@/hooks/useNodeData";
import { toastError } from "@/components/utils/errorUtils";

export type AudioTranscriptionState =
  | "noFile"
  | "tooLarge"
  | "idle"
  | "running"
  | "done"
  | "error";

type StoredAudio = { key?: string; size?: number } | null | undefined;

/**
 * Where an audio node's transcription stands, and how to start one.
 *
 * Three sources, each for what it knows best:
 * - `nodeData.transcription` (synced with the node data) for the transient
 *   running / error status;
 * - the `transcript` search chunks, through `hasTranscript`, for "done" —
 *   success clears the status, the chunks are the transcript;
 * - `values.audio` for whether there is a file, and whether it fits the
 *   25 MB transcription limit.
 *
 * A status left by a file the user has since replaced (`sourceKey` no longer
 * matching) is ignored: it is about a file that is gone.
 *
 * Pass `withTranscriptCheck: false` when the caller already reads the full
 * transcript and only needs the status.
 */
export function useAudioTranscription(
  nodeDataId: Id<"nodeDatas"> | undefined,
  { withTranscriptCheck = true }: { withTranscriptCheck?: boolean } = {},
) {
  const audio = useNodeDataValuesField<StoredAudio>(nodeDataId, "audio");
  const nodeData = useNodeData(nodeDataId);
  const sourceKey = audio?.key;

  const hasTranscript = useQuery(
    api.ia.transcription.hasTranscript,
    nodeDataId && sourceKey && withTranscriptCheck ? { nodeDataId } : "skip",
  );
  const transcribeAudio = useMutation(api.ia.transcription.transcribeAudio);

  // Covers the gap between the click and the status reaching the node data.
  const [isStarting, setIsStarting] = useState(false);

  const pending =
    sourceKey && nodeData?.transcription?.sourceKey === sourceKey
      ? nodeData.transcription
      : undefined;

  const tooLarge =
    typeof audio?.size === "number" && audio.size > MAX_TRANSCRIPTION_BYTES;

  let state: AudioTranscriptionState;
  if (!sourceKey) state = "noFile";
  else if (pending?.status === "running" || isStarting) state = "running";
  else if (hasTranscript) state = "done";
  else if (tooLarge) state = "tooLarge";
  else if (pending?.status === "error") state = "error";
  else state = "idle";

  const start = useCallback(async () => {
    if (!nodeDataId) return;
    setIsStarting(true);
    try {
      await transcribeAudio({ nodeDataId });
    } catch (error) {
      toastError(error, "Could not start the transcription");
    } finally {
      setIsStarting(false);
    }
  }, [nodeDataId, transcribeAudio]);

  return {
    state,
    error: pending?.status === "error" ? pending.error : undefined,
    /** A transcript exists for the current file, whatever the status says. */
    hasTranscript: hasTranscript === true,
    tooLarge,
    start,
  };
}
