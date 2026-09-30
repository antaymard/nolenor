import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeData, useNodeDataValuesField } from "@/hooks/useNodeData";
import { toastError } from "@/components/utils/errorUtils";

export type MediaTranscriptionState =
  | "noFile"
  | "unavailable"
  | "tooLarge"
  | "idle"
  | "running"
  | "done"
  | "error";

export type TranscribableNodeType = "audio" | "video";

type StoredMediaFile = { key?: string; size?: number } | null | undefined;

/**
 * Where an audio or video node's transcription stands, and how to start one.
 *
 * Three sources, each for what it knows best:
 * - `nodeData.transcription` (synced with the node data) for the transient
 *   running / error status;
 * - the `transcript` search chunks, through `hasTranscript`, for "done" —
 *   success clears the status, the chunks are the transcript;
 * - `values.audio` / `values.video` for whether there is a file, and whether
 *   it fits the limit served by `getTranscriptionLimits` for this node type.
 *   A `null` limit means this deployment cannot transcribe that type
 *   ("unavailable": a video without the voice-server).
 *
 * A status left by a file the user has since replaced (`sourceKey` no longer
 * matching) is ignored: it is about a file that is gone.
 *
 * Pass `withTranscriptCheck: false` when the caller already reads the full
 * transcript and only needs the status.
 */
export function useMediaTranscription(
  nodeDataId: Id<"nodeDatas"> | undefined,
  nodeType: TranscribableNodeType,
  { withTranscriptCheck = true }: { withTranscriptCheck?: boolean } = {},
) {
  const file = useNodeDataValuesField<StoredMediaFile>(nodeDataId, nodeType);
  const nodeData = useNodeData(nodeDataId);
  const sourceKey = file?.key;

  const hasTranscript = useQuery(
    api.ia.transcription.hasTranscript,
    nodeDataId && sourceKey && withTranscriptCheck ? { nodeDataId } : "skip",
  );
  const transcribeAudio = useMutation(api.ia.transcription.transcribeAudio);
  // Served by the backend: it depends on whether the voice-server can split
  // long recordings and extract the audio of a video.
  const limits = useQuery(api.ia.transcription.getTranscriptionLimits, {});
  const maxBytes = limits?.[nodeType];

  // Covers the gap between the click and the status reaching the node data.
  const [isStarting, setIsStarting] = useState(false);

  const pending =
    sourceKey && nodeData?.transcription?.sourceKey === sourceKey
      ? nodeData.transcription
      : undefined;

  const tooLarge =
    typeof file?.size === "number" &&
    typeof maxBytes === "number" &&
    file.size > maxBytes;

  let state: MediaTranscriptionState;
  if (!sourceKey) state = "noFile";
  else if (pending?.status === "running" || isStarting) state = "running";
  else if (hasTranscript) state = "done";
  else if (maxBytes === null) state = "unavailable";
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
    /** Largest transcribable file, in bytes (undefined while loading, null if unavailable). */
    maxBytes,
    /** Long recordings only: parts transcribed so far, out of the total. */
    progress: pending?.status === "running" ? pending.progress : undefined,
    start,
  };
}
