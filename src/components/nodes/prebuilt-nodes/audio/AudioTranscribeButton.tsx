import { TbAlertTriangle, TbCheck, TbTextCaption } from "react-icons/tb";
import { Spinner } from "@/components/shadcn/spinner";
import { NodeToolbarButton } from "../../toolbar/NodeToolbarButton";
import { useAudioTranscription } from "@/hooks/useAudioTranscription";
import type { Id } from "@/../convex/_generated/dataModel";

/**
 * Toolbar entry point of the on-demand transcription.
 *
 * Its own component so that it only mounts while the toolbar shows (the node
 * is selected): the `hasTranscript` subscription behind it then costs nothing
 * for the dozens of audio nodes a canvas may hold.
 *
 * Once transcribed, the button opens the window, where the transcript is read
 * (and re-run if needed) — the toolbar stays a launcher.
 */
export function AudioTranscribeButton({
  nodeDataId,
  onOpenWindow,
}: {
  nodeDataId: Id<"nodeDatas">;
  onOpenWindow: () => void;
}) {
  const { state, error, start, progress, maxBytes } =
    useAudioTranscription(nodeDataId);

  switch (state) {
    case "noFile":
      return null;
    case "running":
      return (
        <NodeToolbarButton
          label={
            progress
              ? `Transcribing… ${progress.done}/${progress.total}`
              : "Transcribing…"
          }
          title="Transcription in progress — you can keep working"
          disabled
        >
          <Spinner />
        </NodeToolbarButton>
      );
    case "done":
      return (
        <NodeToolbarButton
          label="Transcript"
          title="Open the transcript"
          onClick={onOpenWindow}
        >
          <TbCheck />
        </NodeToolbarButton>
      );
    case "tooLarge":
      return (
        <NodeToolbarButton
          label="Transcribe"
          title={`File too large to transcribe${
            maxBytes ? ` (max ${Math.round(maxBytes / (1024 * 1024))} MB)` : ""
          }`}
          disabled
        >
          <TbTextCaption />
        </NodeToolbarButton>
      );
    case "error":
      return (
        <NodeToolbarButton
          label="Retry"
          title={`Transcription failed: ${error ?? "unknown error"}. Click to retry.`}
          onClick={() => void start()}
        >
          <TbAlertTriangle />
        </NodeToolbarButton>
      );
    case "idle":
      return (
        <NodeToolbarButton
          label="Transcribe"
          title="Transcribe this audio to make its content searchable"
          onClick={() => void start()}
        >
          <TbTextCaption />
        </NodeToolbarButton>
      );
  }
}
