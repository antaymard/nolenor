import { useEffect, useRef, useState } from "react";
import {
  TbAlertTriangle,
  TbMicrophone,
  TbPlayerStopFilled,
  TbTrash,
  TbX,
} from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import { Kbd } from "@/components/shadcn/kbd";
import { Spinner } from "@/components/shadcn/spinner";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import { formatTime } from "@/hooks/useMediaPlayback";
import { cn } from "@/lib/utils";
import { getVoiceMemoLevel, useVoiceMemoStore } from "@/stores/voiceMemoStore";

/** Secondes écoulées depuis `startedAt`, rafraîchies tant que `active`. */
function useElapsed(startedAt: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [active]);
  return active ? Math.max(0, (now - startedAt) / 1000) : 0;
}

/** Barre de niveau du micro, animée hors de React (une frame = un style). */
function LevelMeter() {
  const barRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      if (barRef.current) {
        barRef.current.style.transform = `scaleX(${Math.max(0.03, getVoiceMemoLevel())})`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        ref={barRef}
        className="h-full w-full origin-left rounded-full bg-red-500 transition-transform duration-75"
      />
    </div>
  );
}

function DiscardButton({
  onConfirm,
  shouldConfirm,
}: {
  onConfirm: () => void;
  shouldConfirm: boolean;
}) {
  return (
    <ConfirmableButton
      title="Discard this voice memo?"
      text="The recording will be lost."
      confirmLabel="Discard"
      destructive
      shouldConfirm={shouldConfirm}
      onConfirm={onConfirm}
    >
      <Button variant="ghost" size="sm" className="text-muted-foreground">
        <TbTrash /> Discard
      </Button>
    </ConfirmableButton>
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
  const phase = useVoiceMemoStore((s) => s.phase);
  const startedAt = useVoiceMemoStore((s) => s.startedAt);
  const error = useVoiceMemoStore((s) => s.error);
  const hasPendingSave = useVoiceMemoStore((s) => s.hasPendingSave);
  const uploadPercent = useVoiceMemoStore((s) => s.uploadPercent);
  const isPanelOpen = useVoiceMemoStore((s) => s.isPanelOpen);
  const setPanelOpen = useVoiceMemoStore((s) => s.setPanelOpen);
  const start = useVoiceMemoStore((s) => s.start);
  const stop = useVoiceMemoStore((s) => s.stop);
  const discard = useVoiceMemoStore((s) => s.discard);
  const retrySave = useVoiceMemoStore((s) => s.retrySave);

  const isRecording = phase === "recording";
  const elapsed = useElapsed(startedAt, isRecording);
  const canStart = phase === "idle" || (phase === "error" && !hasPendingSave);

  const handleOpenChange = (open: boolean) => {
    if (open && canStart) void start(canvasId);
    else setPanelOpen(open);
  };

  return (
    <Popover open={isPanelOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size={isRecording ? "default" : "icon"}
          className={cn(
            "relative h-10 rounded-lg",
            isRecording ? "gap-1.5 px-3" : "w-10",
            (isRecording || phase === "starting") &&
              "bg-red-500 text-white hover:bg-red-600 hover:text-white",
          )}
          aria-label={isRecording ? "Voice memo recording" : "Record a voice memo"}
          title={isRecording ? "Recording — click to show" : "Record a voice memo (R)"}
        >
          {phase === "saving" ? (
            <Spinner />
          ) : (
            <TbMicrophone
              size={19}
              className={cn(isRecording && "animate-pulse")}
            />
          )}
          {isRecording && (
            <span className="text-xs tabular-nums">{formatTime(elapsed)}</span>
          )}
          {phase === "error" && (
            <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-amber-500" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        sideOffset={12}
        className="w-72 rounded-xl p-3 shadow-xl"
        // Le focus reste au canvas : le panel ne doit pas voler R ou Échap.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Voice memo
          </span>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setPanelOpen(false)}
            title={
              isRecording ? "Hide — the recording continues" : "Close"
            }
          >
            <TbX size={14} />
          </button>
        </div>

        {phase === "starting" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Waiting for the microphone…
          </p>
        )}

        {isRecording && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <span className="relative flex size-2.5 shrink-0">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-red-500 opacity-75" />
                <span className="relative inline-flex size-2.5 rounded-full bg-red-500" />
              </span>
              <span className="text-sm tabular-nums">{formatTime(elapsed)}</span>
              <div className="flex-1">
                <LevelMeter />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <DiscardButton
                onConfirm={discard}
                // Quelques secondes ratées ne valent pas une confirmation.
                shouldConfirm={elapsed > 10}
              />
              <Button
                size="sm"
                className="bg-red-500 text-white hover:bg-red-600"
                onClick={stop}
              >
                <TbPlayerStopFilled /> Stop
                <Kbd className="bg-white/20 text-white">R</Kbd>
              </Button>
            </div>
          </div>
        )}

        {phase === "saving" && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> Saving…
            {uploadPercent > 0 && ` ${Math.round(uploadPercent)}%`}
          </p>
        )}

        {phase === "error" && (
          <div className="flex flex-col gap-3">
            <p className="flex items-start gap-2 text-sm text-destructive">
              <TbAlertTriangle className="mt-0.5 shrink-0" />
              {error}
            </p>
            <div className="flex items-center justify-end gap-2">
              {hasPendingSave ? (
                <>
                  <DiscardButton onConfirm={discard} shouldConfirm />
                  <Button size="sm" onClick={retrySave}>
                    Retry
                  </Button>
                </>
              ) : (
                <Button size="sm" onClick={() => void start(canvasId)}>
                  Try again
                </Button>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
