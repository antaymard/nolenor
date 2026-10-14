import { useEffect, useRef, useState } from "react";
import {
  TbMicrophone2,
  TbPlayerStopFilled,
  TbTrash,
  TbX,
} from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import { formatTime } from "@/hooks/useMediaPlayback";
import { cn } from "@/lib/utils";
import { useVoiceMemoStore } from "@/stores/voiceMemoStore";
import { Kbd } from "../shadcn/kbd";

/** Secondes écoulées depuis `since`, rafraîchies deux fois par seconde. */
function useElapsed(since: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [since]);
  return since === null ? 0 : Math.max(0, (now - since) / 1000);
}

/** Niveau du micro, animé hors de React : une frame = un style, aucun rendu. */
function LevelMeter({ stream }: { stream: MediaStream }) {
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Uint8Array(analyser.fftSize);
    let frame = 0;
    const tick = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) sum += ((sample - 128) / 128) ** 2;
      const level = Math.min(1, Math.sqrt(sum / samples.length) * 4);
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${Math.max(0.03, level)})`;
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      void context.close();
    };
  }, [stream]);
  return (
    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
      <div ref={barRef} className="h-full origin-left bg-red-500" />
    </div>
  );
}

/**
 * Le bouton micro de la toolbar et son panel. Au clic, l'enregistrement part
 * et le panel s'ouvre au-dessus ; le fermer n'arrête rien, le bouton reste
 * rouge et compte. Au Stop, le mémo devient un node audio sur ce canvas (cf.
 * `voiceMemoStore`).
 */
export default function VoiceMemoButton({
  canvasId,
}: {
  canvasId: Id<"canvases">;
}) {
  const {
    phase,
    startedAt,
    error,
    hasPendingSave,
    uploadPercent,
    isPanelOpen,
    stream,
    setPanelOpen,
    start,
    stop,
    discard,
    retrySave,
  } = useVoiceMemoStore();

  const isRecording = phase === "recording";
  const elapsed = useElapsed(isRecording ? startedAt : null);
  const canStart = phase === "idle" || (phase === "error" && !hasPendingSave);

  const discardButton = (
    <ConfirmableButton
      title="Discard this voice memo?"
      text="The recording will be lost."
      confirmLabel="Discard"
      destructive
      // Quelques secondes ratées ne valent pas une confirmation.
      shouldConfirm={hasPendingSave || elapsed > 10}
      onConfirm={discard}
    >
      <Button variant="ghost" size="sm" className="text-muted-foreground">
        <TbTrash /> Discard
      </Button>
    </ConfirmableButton>
  );

  return (
    <Popover
      open={isPanelOpen}
      onOpenChange={(open) =>
        open && canStart ? void start(canvasId) : setPanelOpen(open)
      }
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            "relative h-10 min-w-10 gap-1.5 rounded-lg px-2.5",
            (isRecording || phase === "starting") &&
              "bg-red-500 text-white hover:bg-red-600 hover:text-white",
          )}
          aria-label="Record a voice memo"
          title={
            isRecording
              ? "Recording — click to show"
              : "Record a voice memo (R)"
          }
        >
          {phase === "saving" ? (
            <Spinner />
          ) : (
            <TbMicrophone2
              size={19}
              className={cn(isRecording && "animate-pulse")}
            />
          )}
          {isRecording ? (
            <span className="text-xs tabular-nums">{formatTime(elapsed)}</span>
          ) : (
            <Kbd>R</Kbd>
          )}
          {phase === "error" && (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-500" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        sideOffset={12}
        className="flex w-72 flex-col gap-3 rounded-xl p-3 shadow-xl"
        // Le focus reste au canvas : le panel ne doit pas voler R ou Échap.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="flex items-center gap-2 text-sm">
          {isRecording ? (
            <>
              <span className="size-2.5 shrink-0 animate-pulse rounded-full bg-red-500" />
              <span className="tabular-nums">{formatTime(elapsed)}</span>
              {stream && <LevelMeter stream={stream} />}
            </>
          ) : phase === "error" ? (
            <span className="flex-1 text-destructive">{error}</span>
          ) : (
            <span className="flex flex-1 items-center gap-2 text-muted-foreground">
              <Spinner />
              {phase === "starting"
                ? "Waiting for the microphone…"
                : `Saving…${uploadPercent > 0 ? ` ${Math.round(uploadPercent)}%` : ""}`}
            </span>
          )}
          <button
            type="button"
            className="ml-auto text-muted-foreground hover:text-foreground"
            onClick={() => setPanelOpen(false)}
            title={isRecording ? "Hide — the recording continues" : "Close"}
          >
            <TbX size={14} />
          </button>
        </div>

        {(isRecording || (phase === "error" && hasPendingSave)) && (
          <div className="flex items-center justify-between">
            {discardButton}
            {isRecording ? (
              <Button
                size="sm"
                className="bg-red-500 text-white hover:bg-red-600"
                onClick={stop}
              >
                <TbPlayerStopFilled /> Stop
              </Button>
            ) : (
              <Button size="sm" onClick={retrySave}>
                Retry
              </Button>
            )}
          </div>
        )}
        {phase === "error" && !hasPendingSave && (
          <Button
            size="sm"
            className="self-end"
            onClick={() => void start(canvasId)}
          >
            Try again
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
