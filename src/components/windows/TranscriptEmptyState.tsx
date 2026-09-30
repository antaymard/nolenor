import { TbAlertTriangle, TbTextCaption } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import type { useMediaTranscription } from "@/hooks/useMediaTranscription";

/**
 * What a transcript area shows before there is a transcript: the audio
 * window's body, the video window's side panel.
 */
export function TranscriptEmptyState({
  transcription,
  noun,
}: {
  transcription: ReturnType<typeof useMediaTranscription>;
  /** What is transcribed, in the call to action: "audio", "video". */
  noun: string;
}) {
  const { state, error, start, progress, maxBytes } = transcription;

  if (state === "running") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <Spinner className="size-5 text-muted-foreground" />
        <p className="text-sm text-slate-600">
          {progress
            ? `Transcribing… ${progress.done}/${progress.total} parts`
            : "Transcribing…"}
        </p>
        <p className="text-xs text-muted-foreground">
          You can close this window, the transcription keeps going.
        </p>
      </div>
    );
  }

  if (state === "tooLarge" || state === "unavailable") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <TbTextCaption className="size-6 text-slate-300" />
        <p className="text-sm text-slate-500">
          {state === "unavailable"
            ? `Transcription is not available for this ${noun}.`
            : `This file is too large to be transcribed${
                maxBytes
                  ? ` (max ${Math.round(maxBytes / (1024 * 1024))} MB)`
                  : ""
              }.`}
        </p>
      </div>
    );
  }

  if (state === "noFile") return null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      {state === "error" ? (
        <p className="flex max-w-sm items-start gap-1.5 text-left text-xs text-destructive">
          <TbAlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">
            {error ?? "The transcription failed."}
          </span>
        </p>
      ) : (
        <>
          <TbTextCaption className="size-6 text-slate-300" />
          <p className="max-w-sm text-sm text-slate-500">
            Transcribe this {noun} to read it here, jump to any passage, and
            find what was said from search and from Nolë.
          </p>
        </>
      )}
      <Button size="sm" onClick={() => void start()}>
        <TbTextCaption />
        {state === "error" ? "Retry" : "Transcribe"}
      </Button>
    </div>
  );
}
