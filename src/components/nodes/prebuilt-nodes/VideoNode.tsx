import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  TbDownload,
  TbGauge,
  TbMaximize,
  TbPlayerPause,
  TbPlayerPlay,
  TbPlayerTrackPrev,
  TbVideo,
  TbVolume,
  TbVolumeOff,
} from "react-icons/tb";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeFrame from "../NodeFrame";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import { NodeToolbarButton } from "../toolbar/NodeToolbarButton";
import NodeEmptyState from "../NodeEmptyState";
import MediaProgressBar from "./media/MediaProgressBar";
import { Button } from "@/components/shadcn/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { VideoEditControl } from "../edit/VideoEditControl";
import type { VideoValue } from "../edit/VideoEditControl";
import { useNodeDataValuesField } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useDownloadFile } from "@/hooks/useDownloadFile";
import { formatTime, useMediaPlayback } from "@/hooks/useMediaPlayback";
import { useAudioStore } from "@/stores/audioStore";
import { useWindowsStore } from "@/stores/windowsStore";
import { cn } from "@/lib/utils";
import type { XyNodeProps } from "@/types/domain";

export type { VideoValue };

const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

function VideoNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const variant = (xyNode.data?.variant as string | undefined) ?? "player";
  const isTitleVariant = variant === "title";

  // Field-level selectors: changing the rate must not invalidate the video
  // object, and vice versa.
  const video =
    useNodeDataValuesField<VideoValue | null>(nodeDataId, "video") ?? null;
  const playbackRate =
    useNodeDataValuesField<number>(nodeDataId, "playbackRate") ?? 1;

  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const { downloadStoredFile } = useDownloadFile();

  // Set by the element's own `error` event, which is the only trustworthy
  // verdict on whether this browser can decode the file: canPlayType lies in
  // both directions for container types like video/quicktime.
  const [loadFailed, setLoadFailed] = useState(false);

  const videoUrl = video?.url;
  useEffect(() => {
    setLoadFailed(false);
  }, [videoUrl]);

  // Normally written at upload time from the local file; this covers the case
  // where the capture could not read it.
  const handleDurationDetected = useCallback(
    (duration: number) => {
      if (!nodeDataId || !video || video.duration > 0) return;
      updateNodeDataValues({
        nodeDataId,
        values: { video: { ...video, duration } },
      });
    },
    [nodeDataId, updateNodeDataValues, video],
  );

  const {
    mediaRef,
    progressRef,
    playheadRef,
    timeLabelRef,
    isPlaying,
    duration: detectedDuration,
    toggle,
    pause,
    seekToRatio,
    restart,
    handleLoadedMetadata,
    handleEnded,
  } = useMediaPlayback<HTMLVideoElement>({
    nodeId: xyNode.id,
    playbackRate,
    onDurationDetected: handleDurationDetected,
  });

  const duration = video?.duration || detectedDuration;

  const handleRateChange = useCallback(
    (rate: number) => {
      if (!nodeDataId || rate === playbackRate) return;
      updateNodeDataValues({ nodeDataId, values: { playbackRate: rate } });
    },
    [nodeDataId, playbackRate, updateNodeDataValues],
  );

  const displayName = video?.label?.trim() || video?.filename || "";

  const openWindow = useWindowsStore((s) => s.openWindow);

  const handleOpenWindow = useCallback(() => {
    if (!nodeDataId) return;
    openWindow({ xyNodeId: xyNode.id, nodeDataId, nodeType: "video" });
  }, [nodeDataId, openWindow, xyNode.id]);

  const handleDownload = useCallback(() => {
    if (!video) return;
    void downloadStoredFile({
      key: video.key,
      url: video.url,
      filename: video.filename,
    });
  }, [downloadStoredFile, video]);

  const notifyStopped = useAudioStore((s) => s.notifyStopped);

  /**
   * Two things take the <video> away mid-playback: switching to the title
   * variant, and the file turning out to be undecodable.
   *
   * The element itself needs no help — removing a media element from the
   * document pauses it, per spec. What does not clean itself up is our own
   * state: `isPlaying` would stay true, so coming back to the player variant
   * would show a pause button over a stopped video, and the playback slot
   * would stay claimed by a node that is no longer playing anything.
   */
  const hasPlayer = !isTitleVariant && !loadFailed;
  useEffect(() => {
    if (hasPlayer) return;
    pause();
    notifyStopped(xyNode.id);
  }, [hasPlayer, notifyStopped, pause, xyNode.id]);

  const stopMouseDown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const volume = useAudioStore((s) => s.volume);
  const muted = useAudioStore((s) => s.muted);
  const setVolume = useAudioStore((s) => s.setVolume);
  const toggleMuted = useAudioStore((s) => s.toggleMuted);

  const bar = useMemo(
    () => (
      <MediaProgressBar
        duration={duration}
        tone="light"
        progressRef={progressRef}
        playheadRef={playheadRef}
        onSeekRatio={seekToRatio}
      />
    ),
    [duration, playheadRef, progressRef, seekToRatio],
  );

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        <NodeToolbarButton
          label="Open"
          disabled={!nodeDataId}
          title="Open in window"
          onClick={handleOpenWindow}
        >
          <TbMaximize />
        </NodeToolbarButton>
        {video && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <NodeToolbarButton label="Speed" title="Playback speed">
                  <TbGauge />
                </NodeToolbarButton>
              </PopoverTrigger>
              <PopoverContent className="w-56">
                {/* Le volume vit dans la ligne de contrôles du lecteur, pas
                    ici : un même réglage à deux endroits est pire qu'un
                    réglage mal placé. */}
                <p className="mb-1.5 text-xs text-muted-foreground">Speed</p>
                <div className="flex flex-wrap gap-1">
                  {PLAYBACK_RATES.map((rate) => (
                    <Button
                      key={rate}
                      size="sm"
                      variant={rate === playbackRate ? "default" : "outline"}
                      onClick={() => handleRateChange(rate)}
                    >
                      {rate}x
                    </Button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Pitch is preserved.
                </p>
              </PopoverContent>
            </Popover>
            <NodeToolbarButton
              label="Download"
              title="Download"
              onClick={handleDownload}
            >
              <TbDownload />
            </NodeToolbarButton>
          </>
        )}
        <VideoEditControl nodeDataId={nodeDataId} />
      </CanvasNodeToolbar>

      <NodeFrame xyNode={xyNode} resizable={!isTitleVariant}>
        {!video ? (
          <NodeEmptyState
            icon={<TbVideo size={22} />}
            title="No video"
            action="pencil"
          />
        ) : isTitleVariant ? (
          // No player at 33px tall: there is nowhere to show the picture.
          // Double-clicking opens the window, which is where you watch it.
          <div className="flex h-full w-full min-w-0 items-center gap-2 px-2">
            <TbVideo size={18} className="shrink-0" />
            <p className="min-w-0 flex-1 truncate">{displayName}</p>
          </div>
        ) : (
          <div className="flex h-full w-full min-w-0 flex-col gap-1 p-2">
            {/* `group/player` nommé : le survol pilote la surimpression en CSS
                pur, sans état React — un node en cours de lecture ne doit pas
                se re-rendre chaque fois que la souris le traverse. */}
            <div className="group/player relative min-h-0 flex-1 overflow-hidden rounded bg-black/90">
              {loadFailed ? (
                <div className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-3 text-center">
                  <TbVideo size={20} className="text-white/70" />
                  <p className="text-[11px] leading-4 text-white/70">
                    This browser cannot play this format.
                  </p>
                  <button
                    type="button"
                    className="nodrag text-[11px] text-white/90 underline underline-offset-2"
                    onMouseDown={stopMouseDown}
                    onClick={handleDownload}
                  >
                    Download the file
                  </button>
                </div>
              ) : (
                <>
                  <video
                    ref={mediaRef}
                    // With a poster, `preload="none"` means not one byte of
                    // the video is fetched until playback starts: a canvas
                    // full of video nodes costs what a canvas of images
                    // costs. Without one, the media fragment makes the
                    // browser paint a frame.
                    src={video.poster?.url ? video.url : `${video.url}#t=0.1`}
                    poster={video.poster?.url}
                    preload={video.poster?.url ? "none" : "metadata"}
                    playsInline
                    className="h-full w-full object-contain"
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={handleEnded}
                    onError={() => setLoadFailed(true)}
                  />

                  {/* Les contrôles sont posés sur l'image, donc sur un dégradé
                      qui les garde lisibles quelle que soit la frame. Masqués,
                      ils perdent aussi les pointer events : un bouton
                      invisible ne doit pas rester cliquable. */}
                  <div
                    className={cn(
                      "absolute inset-x-0 bottom-0 flex flex-col gap-1 px-2 pb-1.5 pt-8",
                      "bg-gradient-to-t from-black/80 via-black/40 to-transparent",
                      "opacity-0 transition-opacity duration-150",
                      "pointer-events-none group-hover/player:pointer-events-auto group-hover/player:opacity-100",
                    )}
                  >
                    {bar}

                    <div className="nodrag flex items-center gap-1.5 text-xs text-white">
                      <button
                        type="button"
                        className="text-white/80 hover:text-white"
                        onMouseDown={stopMouseDown}
                        onClick={restart}
                        title="Back to start"
                      >
                        <TbPlayerTrackPrev size={15} />
                      </button>
                      <button
                        type="button"
                        className="text-white hover:text-white/80"
                        onMouseDown={stopMouseDown}
                        onClick={toggle}
                        title={isPlaying ? "Pause" : "Play"}
                      >
                        {isPlaying ? (
                          <TbPlayerPause size={18} />
                        ) : (
                          <TbPlayerPlay size={18} />
                        )}
                      </button>
                      <span className="tabular-nums text-white/80">
                        <span ref={timeLabelRef}>0:00</span>
                        {" / "}
                        {formatTime(duration)}
                      </span>

                      <span className="ml-auto flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="text-white/80 hover:text-white"
                          onMouseDown={stopMouseDown}
                          onClick={toggleMuted}
                          title={muted ? "Unmute" : "Mute"}
                        >
                          {muted ? (
                            <TbVolumeOff size={15} />
                          ) : (
                            <TbVolume size={15} />
                          )}
                        </button>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={muted ? 0 : volume}
                          onMouseDown={stopMouseDown}
                          onChange={(e) => setVolume(Number(e.target.value))}
                          title="Volume"
                          className="h-1 w-14 accent-white"
                        />
                      </span>
                    </div>
                  </div>
                </>
              )}
            </div>

            <p className="truncate text-sm font-medium">{displayName}</p>
          </div>
        )}
      </NodeFrame>
    </>
  );
}

export default memo(VideoNode, areNodePropsEqual);
