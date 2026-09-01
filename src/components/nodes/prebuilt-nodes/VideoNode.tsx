import { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  TbDownload,
  TbGauge,
  TbMaximize,
  TbPencil,
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
import MediaProgressBar from "./media/MediaProgressBar";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { UploadFile } from "@/components/fields/UploadFile";
import { useNodeDataValuesField } from "@/hooks/useNodeData";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { useFileUpload } from "@/hooks/useFilesUpload";
import { useDownloadFile } from "@/hooks/useDownloadFile";
import { captureVideoPoster, posterFileFrom } from "@/lib/videoPoster";
import { formatTime, useMediaPlayback } from "@/hooks/useMediaPlayback";
import { useAudioStore } from "@/stores/audioStore";
import { useWindowsStore } from "@/stores/windowsStore";
import { cn } from "@/lib/utils";
import type { XyNodeProps } from "@/types/domain";

export type VideoValue = {
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedAt: number;
  key: string;
  duration: number;
  width: number;
  height: number;
  label?: string;
  poster?: { url: string; key: string } | null;
};

/** Mirrors getNodeDataTitle: what the user typed, then the filename. */
function displayNameOf(video: VideoValue | null): string {
  if (!video) return "";
  return video.label?.trim() || video.filename;
}

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
  const { uploadFile } = useFileUpload();
  const { downloadStoredFile } = useDownloadFile();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
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

  const handleUploadComplete = useCallback(
    async (
      fileData: {
        url: string;
        filename: string;
        mimeType: string;
        size: number;
        uploadedAt: number;
        key: string;
      },
      file: File,
    ) => {
      if (!nodeDataId) return;
      setIsPopoverOpen(false);

      const captured = await captureVideoPoster(file);

      let poster: { url: string; key: string } | null = null;
      if (captured.poster) {
        try {
          const uploaded = await uploadFile(posterFileFrom(captured.poster));
          poster = { url: uploaded.url, key: uploaded.key };
        } catch (error) {
          console.warn("[VideoNode] poster upload failed", error);
        }
      }

      // One write for the whole gesture: splitting it would create two
      // versions and run the R2 reference sync twice.
      updateNodeDataValues({
        nodeDataId,
        values: {
          video: {
            ...fileData,
            duration: captured.duration ?? 0,
            width: captured.width ?? 0,
            height: captured.height ?? 0,
            poster,
          },
        },
      });
    },
    [nodeDataId, updateNodeDataValues, uploadFile],
  );

  const displayName = displayNameOf(video);

  const handleRename = useCallback(() => {
    if (!nodeDataId || !video) {
      setIsPopoverOpen(false);
      return;
    }
    const next = titleDraft.trim();
    // Writes `label`, never `filename`: renaming the node must not change the
    // name the file is downloaded under.
    if (next && next !== displayNameOf(video)) {
      updateNodeDataValues({
        nodeDataId,
        values: { video: { ...video, label: next } },
      });
    }
    setIsPopoverOpen(false);
  }, [nodeDataId, titleDraft, updateNodeDataValues, video]);

  const handlePopoverOpenChange = useCallback(
    (open: boolean) => {
      setIsPopoverOpen(open);
      if (open) setTitleDraft(displayName);
    },
    [displayName],
  );

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
        <Button
          size="icon"
          variant="outline"
          disabled={!nodeDataId}
          title="Open in window"
          onClick={handleOpenWindow}
        >
          <TbMaximize />
        </Button>
        {video && (
          <>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="icon" title="Playback speed">
                  <TbGauge />
                </Button>
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
            <Button
              variant="outline"
              size="icon"
              title="Download"
              onClick={handleDownload}
            >
              <TbDownload />
            </Button>
          </>
        )}
        <Popover open={isPopoverOpen} onOpenChange={handlePopoverOpenChange}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              title={video ? "Rename or replace" : "Add a file"}
            >
              <TbPencil />
            </Button>
          </PopoverTrigger>
          <PopoverContent>
            <div className="flex flex-col gap-2">
              <UploadFile
                accept="video/*"
                onUploadComplete={handleUploadComplete}
              />
              {video && (
                <>
                  <Input
                    onDoubleClick={stopMouseDown}
                    type="text"
                    placeholder="File name"
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename();
                    }}
                  />
                  <Button size="sm" onClick={handleRename}>
                    Save
                  </Button>
                </>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </CanvasNodeToolbar>

      <NodeFrame xyNode={xyNode} resizable={!isTitleVariant}>
        {!video ? (
          <div className="flex h-full w-full items-center justify-center gap-2 px-2">
            <TbVideo size={18} className="shrink-0" />
            <p className="text-muted-foreground">No video</p>
          </div>
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
