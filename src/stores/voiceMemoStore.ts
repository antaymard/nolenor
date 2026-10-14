import { create } from "zustand";
import type { XYPosition } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import type { UploadedFileData } from "@/hooks/useFilesUpload";
import { describeMicrophoneError } from "@/lib/speechErrors";

/**
 * Le mémo vocal : un enregistrement lancé depuis la toolbar du canvas, qui
 * devient un node audio ordinaire au Stop.
 *
 * L'enregistrement vit ici, hors de React : le panel peut se fermer, la
 * toolbar se démonter (changement de canvas, retour à l'accueil), le
 * MediaRecorder continue jusqu'au Stop. Ce qui a besoin de React est branché
 * de l'extérieur :
 * - l'upload et la création côté serveur par `VoiceMemoController`, monté une
 *   fois à la racine (`deps`) ;
 * - la création local-first sur le canvas ouvert par
 *   `useVoiceMemoCanvasBinding` (`bindings`), qui arrête et sauve aussi
 *   l'enregistrement quand on quitte le canvas où il a commencé.
 *
 * Le node atterrit toujours sur le canvas du début, au centre de la vue au
 * moment de l'arrêt.
 */

export type VoiceMemoPhase =
  | "idle"
  | "starting"
  | "recording"
  | "saving"
  | "error";

export type VoiceMemoTarget = {
  canvasId: Id<"canvases">;
  /** Centre de la vue à l'arrêt, en coordonnées canvas. */
  center: XYPosition;
  zIndex: number;
};

export type VoiceMemoBinding = {
  getTarget: () => Omit<VoiceMemoTarget, "canvasId">;
  /** Création local-first (sélection, undo) — résout à la confirmation. */
  create: (
    values: Record<string, unknown>,
    target: VoiceMemoTarget,
  ) => Promise<void>;
};

export type VoiceMemoDeps = {
  uploadFile: (
    file: File,
    onProgress: (percent: number) => void,
  ) => Promise<UploadedFileData>;
  /** Création directe, quand le canvas du début n'est plus ouvert. */
  createOnServer: (
    values: Record<string, unknown>,
    target: VoiceMemoTarget,
  ) => Promise<void>;
  buildValues: (
    uploaded: UploadedFileData,
    meta: { duration: number; label: string },
  ) => Record<string, unknown>;
  onSavedElsewhere: () => void;
};

type VoiceMemoState = {
  phase: VoiceMemoPhase;
  /** Canvas où l'enregistrement a commencé. */
  canvasId: Id<"canvases"> | null;
  startedAt: number;
  error: string | null;
  /** Un enregistrement attend d'être sauvé (échec d'upload ou de création). */
  hasPendingSave: boolean;
  uploadPercent: number;
  isPanelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  start: (canvasId: Id<"canvases">) => Promise<void>;
  stop: () => void;
  discard: () => void;
  retrySave: () => void;
};

// audio/webm n'est pas supporté partout (Safari => audio/mp4).
const MIME_CANDIDATES = ["audio/webm", "audio/mp4", "audio/ogg"];
const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
};

type Pending = {
  blob: Blob;
  duration: number;
  recordedAt: Date;
  target: VoiceMemoTarget;
};

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let chunks: Blob[] = [];
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let levelBuffer: Uint8Array<ArrayBuffer> | null = null;
let pending: Pending | null = null;
/** Bumped by discard: a `start` still waiting on the microphone gives up. */
let session = 0;

const bindings = new Map<Id<"canvases">, VoiceMemoBinding>();
let deps: VoiceMemoDeps | null = null;

function releaseMicrophone() {
  stream?.getTracks().forEach((track) => track.stop());
  stream = null;
  void audioContext?.close().catch(() => {});
  audioContext = null;
  analyser = null;
  levelBuffer = null;
}

function memoNames(recordedAt: Date, mimeType: string) {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${recordedAt.getFullYear()}-${pad(recordedAt.getMonth() + 1)}-${pad(recordedAt.getDate())}-${pad(recordedAt.getHours())}${pad(recordedAt.getMinutes())}`;
  return {
    filename: `voice-memo-${stamp}.${EXTENSIONS[mimeType] ?? "webm"}`,
    label: `Voice memo — ${recordedAt.toLocaleString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })}`,
  };
}

export const useVoiceMemoStore = create<VoiceMemoState>((set, get) => {
  async function save() {
    const job = pending;
    if (!job) return;
    if (!deps) {
      set({ phase: "error", error: "The voice memo could not be saved." });
      return;
    }
    set({ phase: "saving", error: null, uploadPercent: 0 });
    try {
      // MediaRecorder reports e.g. "audio/webm;codecs=opus": the codec
      // parameter is dropped so the type matches the upload allowlist.
      const mimeType = (job.blob.type.split(";")[0] || "audio/webm").trim();
      const { filename, label } = memoNames(job.recordedAt, mimeType);
      const file = new File([job.blob], filename, { type: mimeType });
      const uploaded = await deps.uploadFile(file, (percent) =>
        set({ uploadPercent: percent }),
      );
      // Recorded webm carries no duration header (the element reports
      // Infinity), so the measured length is written with the file.
      const values = deps.buildValues(uploaded, {
        duration: job.duration,
        label,
      });

      const binding = bindings.get(job.target.canvasId);
      if (binding) {
        await binding.create(values, job.target);
      } else {
        await deps.createOnServer(values, job.target);
        deps.onSavedElsewhere();
      }

      pending = null;
      set({
        phase: "idle",
        canvasId: null,
        hasPendingSave: false,
        isPanelOpen: false,
        uploadPercent: 0,
      });
    } catch (err) {
      console.warn("[voiceMemo] save failed", err);
      set({
        phase: "error",
        error: "The voice memo could not be saved.",
        hasPendingSave: true,
      });
    }
  }

  return {
    phase: "idle",
    canvasId: null,
    startedAt: 0,
    error: null,
    hasPendingSave: false,
    uploadPercent: 0,
    isPanelOpen: false,

    setPanelOpen: (open) => set({ isPanelOpen: open }),

    start: async (canvasId) => {
      const { phase } = get();
      // An unsaved memo is never dropped silently: it must be saved or
      // discarded first.
      if (phase !== "idle" && !(phase === "error" && !pending)) return;

      const mySession = ++session;
      set({
        phase: "starting",
        canvasId,
        error: null,
        hasPendingSave: false,
        isPanelOpen: true,
      });

      try {
        if (typeof MediaRecorder === "undefined") {
          throw new Error("Audio recording is not supported by this browser.");
        }
        const acquired = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        if (mySession !== session) {
          acquired.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = acquired;

        const mimeType =
          typeof MediaRecorder.isTypeSupported === "function"
            ? MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m))
            : undefined;
        recorder = new MediaRecorder(
          acquired,
          mimeType ? { mimeType } : undefined,
        );
        chunks = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        // Microphone unplugged or revoked: keep what was recorded.
        acquired.getAudioTracks().forEach((track) => {
          track.onended = () => get().stop();
        });

        try {
          audioContext = new AudioContext();
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 512;
          audioContext.createMediaStreamSource(acquired).connect(analyser);
          levelBuffer = new Uint8Array(analyser.fftSize);
        } catch {
          // The level meter is a nicety: recording works without it.
          analyser = null;
        }

        recorder.start();
        set({ phase: "recording", startedAt: Date.now() });
      } catch (err) {
        releaseMicrophone();
        recorder = null;
        if (mySession !== session) return;
        set({
          phase: "error",
          canvasId: null,
          error:
            err instanceof Error && !(err instanceof DOMException)
              ? err.message
              : describeMicrophoneError(err),
        });
      }
    },

    stop: () => {
      const { phase, canvasId, startedAt } = get();
      if (phase === "starting") {
        get().discard();
        return;
      }
      if (phase !== "recording" || !recorder || !canvasId) return;

      // Read now, synchronously: when the canvas is being left, its binding
      // is about to go away.
      const binding = bindings.get(canvasId);
      const target: VoiceMemoTarget = {
        canvasId,
        ...(binding?.getTarget() ?? { center: { x: 0, y: 0 }, zIndex: 1 }),
      };
      const duration = (Date.now() - startedAt) / 1000;
      const recordedAt = new Date(startedAt);
      const active = recorder;
      recorder = null;

      set({ phase: "saving", uploadPercent: 0 });
      active.onstop = () => {
        releaseMicrophone();
        pending = {
          blob: new Blob(chunks, { type: active.mimeType || "audio/webm" }),
          duration,
          recordedAt,
          target,
        };
        chunks = [];
        void save();
      };
      active.stop();
    },

    discard: () => {
      session++;
      if (recorder) {
        recorder.onstop = null;
        if (recorder.state !== "inactive") recorder.stop();
        recorder = null;
      }
      releaseMicrophone();
      chunks = [];
      pending = null;
      set({
        phase: "idle",
        canvasId: null,
        error: null,
        hasPendingSave: false,
        isPanelOpen: false,
      });
    },

    retrySave: () => {
      if (pending) void save();
    },
  };
});

/** Niveau du micro, 0–1, lu à chaque frame par le panel (aucun rendu React). */
export function getVoiceMemoLevel(): number {
  if (!analyser || !levelBuffer) return 0;
  analyser.getByteTimeDomainData(levelBuffer);
  let sum = 0;
  for (const sample of levelBuffer) {
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }
  return Math.min(1, Math.sqrt(sum / levelBuffer.length) * 4);
}

export function registerVoiceMemoBinding(
  canvasId: Id<"canvases">,
  binding: VoiceMemoBinding,
) {
  bindings.set(canvasId, binding);
  return () => {
    if (bindings.get(canvasId) === binding) bindings.delete(canvasId);
  };
}

export function registerVoiceMemoDeps(next: VoiceMemoDeps) {
  deps = next;
  return () => {
    if (deps === next) deps = null;
  };
}

/** Un enregistrement en cours, ou pas encore sauvé : quitter le perdrait. */
export function isVoiceMemoUnsaved({
  phase,
  hasPendingSave,
}: Pick<VoiceMemoState, "phase" | "hasPendingSave">): boolean {
  return (
    phase === "starting" ||
    phase === "recording" ||
    phase === "saving" ||
    hasPendingSave
  );
}
