import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { TbRefresh, TbVideo } from "react-icons/tb";
import {
  MediaPlayer,
  MediaProvider,
  Poster,
  Track,
  type MediaPlayerInstance,
  type VideoMimeType,
} from "@vidstack/react";
import {
  DefaultVideoLayout,
  defaultLayoutIcons,
} from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
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
 * monte une autre ailleurs dans l'arbre React. Le lecteur est donc neuf, et
 * repartirait à 0:00 — indolore pour un tableau, pénible sur une vidéo de
 * quarante minutes.
 *
 * Un module-level Map plutôt qu'un store : l'information ne survit pas à la
 * session, n'intéresse personne d'autre, et n'a aucune raison de déclencher
 * un rendu. Une entrée par vidéo ouverte, retirée dès qu'elle est consommée.
 */
const lastPositionByNode = new Map<Id<"nodeDatas">, number>();

const PLAYABLE_VIDEO_TYPES = new Set<string>([
  "video/mp4",
  "video/webm",
  "video/3gp",
  "video/ogg",
  "video/avi",
  "video/mpeg",
]);

/**
 * Le type annoncé au lecteur. Vidstack choisit son provider d'après lui ; un
 * type qu'il ne connaît pas (video/quicktime) passe pour du mp4 — le `<video>`
 * sous-jacent décide ensuite, comme sur le node, s'il sait le décoder.
 */
function playerMimeType(mimeType: string | undefined): VideoMimeType {
  return mimeType && PLAYABLE_VIDEO_TYPES.has(mimeType)
    ? (mimeType as VideoMimeType)
    : "video/mp4";
}

interface VideoWindowProps {
  xyNodeId: string;
  nodeDataId: Id<"nodeDatas">;
}

/**
 * Watching surface: the picture as large as the window allows, in a Vidstack
 * player — fullscreen, picture-in-picture, speed and keyboard shortcuts, and
 * the transcript's chapters in the time slider, as on YouTube. The
 * transcript itself lives in the side panel's Plan tab, by chapter (cf.
 * `MediaTranscriptPanel`): the picture keeps the room.
 *
 * Vidstack only here: this window is lazy-loaded, so the canvas never pays
 * for it, and the node keeps its light native `<video>`.
 */
function VideoWindow({ xyNodeId, nodeDataId }: VideoWindowProps) {
  const values = useNodeDataValues(nodeDataId);
  const video = (values?.video as VideoValue | null | undefined) ?? null;
  const playbackRate =
    typeof values?.playbackRate === "number" ? values.playbackRate : 1;

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

  const playerRef = useRef<MediaPlayerInstance>(null);
  const hasRestoredRef = useRef(false);

  const requestPlay = useAudioStore((s) => s.requestPlay);
  const notifyStopped = useAudioStore((s) => s.notifyStopped);
  const volume = useAudioStore((s) => s.volume);
  const muted = useAudioStore((s) => s.muted);

  // A key of its own, distinct from the node's: the window and the node on the
  // canvas are then two contenders for the same single slot, so opening this
  // window pauses the node without any arbitration code of its own.
  const slotKey = `${xyNodeId}:window`;
  const ownsPlaybackSlot = useAudioStore((s) => s.playingNodeId === slotKey);

  // The user plays through the player's own button, not through our code — so
  // the slot has to be claimed from its events. Miss this and the window plays
  // straight over an audio node.
  const handlePlay = useCallback(() => {
    requestPlay(slotKey);
    clock.setPlaying(true);
  }, [clock, requestPlay, slotKey]);

  const handleStopped = useCallback(() => {
    notifyStopped(slotKey);
    clock.setPlaying(false);
  }, [clock, notifyStopped, slotKey]);

  const handleTimeUpdate = useCallback(
    ({ currentTime }: { currentTime: number }) => clock.setTime(currentTime),
    [clock],
  );

  const seek = useCallback((seconds: number) => {
    const player = playerRef.current;
    if (!player) return;
    player.currentTime = seconds;
    // `play` fires the player's own event, which claims the slot.
    void player.play().catch(() => {});
  }, []);

  // Something else claimed the slot — stand down.
  useEffect(() => {
    const player = playerRef.current;
    if (!player || ownsPlaybackSlot || player.paused) return;
    void player.pause().catch(() => {});
  }, [ownsPlaybackSlot]);

  /**
   * Reprise à l'endroit quitté, une seule fois par montage. En pause : on
   * rend la position, pas la lecture — un plein écran qui démarre tout seul
   * surprend plus qu'il n'aide.
   */
  const handleLoadedMetadata = useCallback(() => {
    const player = playerRef.current;
    if (!player || hasRestoredRef.current) return;
    hasRestoredRef.current = true;

    const saved = lastPositionByNode.get(nodeDataId);
    lastPositionByNode.delete(nodeDataId);
    if (saved === undefined) return;
    if (!Number.isFinite(player.duration) || saved >= player.duration) return;
    player.currentTime = saved;
  }, [nodeDataId]);

  // Leaving: remember the position (the clock has it, no DOM needed — the
  // player may already be detached when this cleanup runs), and hand back the
  // slot. Unmounting the player pauses it on its own.
  useEffect(
    () => () => {
      const position = clock.getTime();
      if (position > 0) lastPositionByNode.set(nodeDataId, position);
      notifyStopped(slotKey);
    },
    [clock, nodeDataId, notifyStopped, slotKey],
  );

  // The transcript's chapters, as a chapters track: the default layout draws
  // them in the time slider and lists them in a menu.
  const chapterCues = useMemo(
    () =>
      transcript?.chapters?.map((chapter) => ({
        startTime: chapter.startSec,
        endTime: chapter.endSec,
        text: chapter.title,
      })) ?? [],
    [transcript],
  );

  const { setPlanTabContent, requestSidePanelOpen } = useWindowFrameContext();
  const isRunning = transcription.state === "running";

  // The transcript lives in the side panel: open it once when there is one to
  // read. Once per mount — closing it afterwards is the user's call.
  const hasRequestedPanelRef = useRef(false);
  useEffect(() => {
    if (!transcript || hasRequestedPanelRef.current) return;
    hasRequestedPanelRef.current = true;
    requestSidePanelOpen();
  }, [requestSidePanelOpen, transcript]);
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
      <MediaPlayer
        ref={playerRef}
        src={{ src: video.url, type: playerMimeType(video.mimeType) }}
        title={video.label?.trim() || video.filename}
        poster={video.poster?.url}
        playsInline
        preload="metadata"
        volume={volume}
        muted={muted}
        playbackRate={playbackRate}
        className="h-full w-full"
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={handlePlay}
        onPause={handleStopped}
        onEnded={handleStopped}
        onTimeUpdate={handleTimeUpdate}
      >
        <MediaProvider>
          <Poster className="vds-poster" />
          {chapterCues.length > 0 && (
            <Track
              // New chapters (a re-run) replace the track rather than patch it.
              key={chapterCues.map((cue) => cue.startTime).join(",")}
              kind="chapters"
              type="json"
              content={{ cues: chapterCues }}
              label="Chapters"
              language="en"
              default
            />
          )}
        </MediaProvider>
        <DefaultVideoLayout icons={defaultLayoutIcons} />
      </MediaPlayer>
    </div>
  );
}

export default memo(VideoWindow);
