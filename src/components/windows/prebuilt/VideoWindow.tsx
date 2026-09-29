import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { TbRefresh, TbVideo } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import { useNodeDataValues } from "@/hooks/useNodeData";
import { useMediaTranscription } from "@/hooks/useMediaTranscription";
import { createPlaybackClock } from "@/lib/transcriptPlayback";
import { useAudioStore } from "@/stores/audioStore";
import type { Id } from "@/../convex/_generated/dataModel";
import type { VideoValue } from "@/components/nodes/prebuilt-nodes/VideoNode";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import { useWindowFrameContext } from "@/components/windows/WindowFrameContext";
import { MediaTranscriptPanel } from "@/components/windows/side-panel/MediaTranscriptPanel";
import { PlanTabPlaceholder } from "@/components/windows/side-panel/PlanTabPlaceholder";
import { TranscriptEmptyState } from "@/components/windows/TranscriptEmptyState";
import WindowLoadingState from "@/components/windows/WindowLoadingState";

/**
 * Où en était la lecture, le temps d'une bascule.
 *
 * Passer en plein écran ne déplace pas la fenêtre : il en démonte une et en
 * monte une autre ailleurs dans l'arbre React. L'élément `<video>` est donc
 * neuf, et repartirait à 0:00 — indolore pour un tableau, pénible sur une
 * vidéo de quarante minutes.
 *
 * Un module-level Map plutôt qu'un store : l'information ne survit pas à la
 * session, n'intéresse personne d'autre, et n'a aucune raison de déclencher
 * un rendu. Une entrée par vidéo ouverte, retirée dès qu'elle est consommée.
 */
const lastPositionByNode = new Map<Id<"nodeDatas">, number>();

interface VideoWindowProps {
  xyNodeId: string;
  nodeDataId: Id<"nodeDatas">;
}

/**
 * Watching surface: the picture as large as the window allows, with the
 * browser's own controls. The transcript lives in the side panel's Plan tab,
 * by chapter (cf. `MediaTranscriptPanel`): the picture keeps the room.
 *
 * Native `controls` here rather than the node's custom strip — off the canvas
 * there is no drag to fight, and they bring native fullscreen, picture-in-
 * picture and subtitle tracks for free.
 */
function VideoWindow({ xyNodeId, nodeDataId }: VideoWindowProps) {
  const values = useNodeDataValues(nodeDataId);
  const video = (values?.video as VideoValue | null | undefined) ?? null;

  const transcript = useQuery(
    api.ia.transcription.getTranscript,
    video?.key ? { nodeDataId } : "skip",
  );
  // The full transcript is already read here: no need for the lighter check.
  const transcription = useMediaTranscription(nodeDataId, "video", {
    withTranscriptCheck: false,
  });
  // Where playback is, for the side panel — without re-rendering this window
  // on every `timeupdate` (cf. transcriptPlayback.ts).
  const [clock] = useState(createPlaybackClock);

  const elementRef = useRef<HTMLVideoElement | null>(null);
  const hasRestoredRef = useRef(false);

  /**
   * Ref callback plutôt que `elementRef` posé directement.
   *
   * La position doit être relevée sur l'élément *sortant*, et un cleanup de
   * `useEffect` arrive trop tard : React détache les refs pendant la phase de
   * mutation, donc `elementRef.current` y est déjà `null`. Le callback, lui,
   * est appelé avec `null` alors que la ref pointe encore sur l'élément qui
   * s'en va.
   */
  const attachVideo = useCallback(
    (el: HTMLVideoElement | null) => {
      const previous = elementRef.current;
      if (!el && previous && previous.currentTime > 0) {
        lastPositionByNode.set(nodeDataId, previous.currentTime);
      }
      elementRef.current = el;
    },
    [nodeDataId],
  );

  const requestPlay = useAudioStore((s) => s.requestPlay);
  const notifyStopped = useAudioStore((s) => s.notifyStopped);
  const volume = useAudioStore((s) => s.volume);
  const muted = useAudioStore((s) => s.muted);

  // A key of its own, distinct from the node's: the window and the node on the
  // canvas are then two contenders for the same single slot, so opening this
  // window pauses the node without any arbitration code of its own.
  const slotKey = `${xyNodeId}:window`;
  const ownsPlaybackSlot = useAudioStore((s) => s.playingNodeId === slotKey);

  // With native controls the user plays through the browser's own button, not
  // through our code — so the slot has to be claimed from the element's
  // events. Miss this and the window plays straight over an audio node.
  const handlePlay = useCallback(() => {
    requestPlay(slotKey);
    clock.setPlaying(true);
  }, [clock, requestPlay, slotKey]);

  const handleStopped = useCallback(() => {
    notifyStopped(slotKey);
    clock.setPlaying(false);
  }, [clock, notifyStopped, slotKey]);

  const handleTimeUpdate = useCallback(() => {
    const el = elementRef.current;
    if (el) clock.setTime(el.currentTime);
  }, [clock]);

  const seek = useCallback((seconds: number) => {
    const el = elementRef.current;
    if (!el) return;
    el.currentTime = seconds;
    // `play` fires the element's own event, which claims the slot.
    void el.play().catch(() => {});
  }, []);

  // Something else claimed the slot — stand down.
  useEffect(() => {
    const el = elementRef.current;
    if (!el || ownsPlaybackSlot || el.paused) return;
    el.pause();
  }, [ownsPlaybackSlot]);

  const applySettings = useCallback(() => {
    const el = elementRef.current;
    if (!el) return;
    el.volume = volume;
    el.muted = muted;
  }, [muted, volume]);

  /**
   * Reprise à l'endroit quitté, une seule fois par montage. En pause : on
   * rend la position, pas la lecture — un plein écran qui démarre tout seul
   * surprend plus qu'il n'aide.
   */
  const handleLoadedMetadata = useCallback(() => {
    applySettings();

    const el = elementRef.current;
    if (!el || hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const saved = lastPositionByNode.get(nodeDataId);
    lastPositionByNode.delete(nodeDataId);
    if (saved === undefined) return;
    if (!Number.isFinite(el.duration) || saved >= el.duration) return;
    el.currentTime = saved;
  }, [applySettings, nodeDataId]);

  // This effect only covers later changes: on the first render `values` is
  // still undefined, so the element does not exist yet and the effect would
  // have nothing to write to — and it never re-runs on its own once the
  // element appears. `loadedmetadata` is what applies the settings the first
  // time, which is the same split useMediaPlayback makes.
  useEffect(() => {
    applySettings();
  }, [applySettings]);

  // Closing the window pauses the element on its own (removing a media element
  // from the document pauses it, per spec), but the slot it claimed is ours to
  // hand back.
  useEffect(() => () => notifyStopped(slotKey), [notifyStopped, slotKey]);

  const { setPlanTabContent } = useWindowFrameContext();
  const isRunning = transcription.state === "running";
  useEffect(() => {
    if (!video) {
      setPlanTabContent(<PlanTabPlaceholder message="No video yet." />);
      return () => setPlanTabContent(null);
    }
    setPlanTabContent(
      <MediaTranscriptPanel
        transcript={transcript}
        clock={clock}
        onSeek={seek}
        emptyState={
          <TranscriptEmptyState transcription={transcription} noun="video" />
        }
        header={
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="ghost"
                disabled={isRunning || transcription.tooLarge}
                title="Transcribe this file again — the current transcript will be replaced"
                onClick={() => void transcription.start()}
              >
                {isRunning ? <Spinner /> : <TbRefresh />}
                Re-transcribe
              </Button>
            </div>
            {isRunning && (
              <p className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                <Spinner className="size-3.5" />
                Transcribing again — this transcript will be replaced when it's
                done.
              </p>
            )}
          </div>
        }
      />,
    );
    return () => setPlanTabContent(null);
  }, [
    clock,
    isRunning,
    seek,
    setPlanTabContent,
    transcript,
    transcription,
    video,
  ]);

  if (!values) return <WindowLoadingState />;

  if (!video) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <TbVideo size={22} />
        <p className="text-sm">No video</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-black">
      <video
        ref={attachVideo}
        src={video.url}
        poster={video.poster?.url}
        controls
        playsInline
        preload="metadata"
        className="max-h-full max-w-full"
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={handlePlay}
        onPause={handleStopped}
        onEnded={handleStopped}
        onTimeUpdate={handleTimeUpdate}
        onSeeked={handleTimeUpdate}
      />
    </div>
  );
}

export default memo(VideoWindow);
