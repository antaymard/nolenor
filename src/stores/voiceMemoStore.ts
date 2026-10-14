import { create } from "zustand";
import type { XYPosition } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import type { UploadedFileData } from "@/hooks/useFilesUpload";

/**
 * Le mémo vocal : un enregistrement lancé depuis la toolbar du canvas, qui
 * devient un node audio ordinaire au Stop.
 *
 Le store tient l'état affiché et la sauvegarde. L'enregistreur
 * (`useAudioRecorder`) vit dans `VoiceMemoController`, monté une fois à la
 * racine : le panel peut se fermer, la toolbar se démonter (changement de
 * canvas, retour à l'accueil), l'enregistrement continue jusqu'au Stop. Ce qui
 * a besoin de React est branché de l'extérieur :
 * - l'enregistreur, l'upload et la création côté serveur par
 *   `VoiceMemoController` (`deps`) ;
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
  recorder: {
    /** Rejette avec un message affichable (micro refusé, absent…). */
    start: () => Promise<void>;
    /** Le blob arrive ensuite par `onRecorded`. */
    stop: () => void;
    reset: () => void;
  };
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
  /** Le flux du micro pendant l'enregistrement, pour l'indicateur de niveau. */
  stream: MediaStream | null;
  setPanelOpen: (open: boolean) => void;
  start: (canvasId: Id<"canvases">) => Promise<void>;
  stop: () => void;
  discard: () => void;
  retrySave: () => void;
  /** Appelé par le contrôleur quand l'enregistreur livre le fichier. */
  onRecorded: (blob: Blob) => void;
};

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
};

type Pending = {
  /** `null` entre le Stop et la livraison du fichier par l'enregistreur. */
  blob: Blob | null;
  duration: number;
  recordedAt: Date;
  target: VoiceMemoTarget;
};

let pending: Pending | null = null;
/** Bumped by discard: a `start` still waiting on the microphone gives up. */
let session = 0;

const bindings = new Map<Id<"canvases">, VoiceMemoBinding>();
let deps: VoiceMemoDeps | null = null;

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
    if (!job?.blob) return;
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
    stream: null,

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
        if (!deps) throw new Error("Audio recording is not available.");
        await deps.recorder.start();
        // Discarded (or the canvas left) while the microphone was asked for.
        if (mySession !== session) {
          deps.recorder.reset();
          return;
        }
        set({ phase: "recording", startedAt: Date.now() });
      } catch (err) {
        if (mySession !== session) return;
        set({
          phase: "error",
          canvasId: null,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },

    stop: () => {
      const { phase, canvasId, startedAt } = get();
      if (phase === "starting") {
        get().discard();
        return;
      }
      if (phase !== "recording" || !canvasId) return;

      // Read now, synchronously: when the canvas is being left, its binding
      // is about to go away.
      const binding = bindings.get(canvasId);
      pending = {
        blob: null,
        duration: (Date.now() - startedAt) / 1000,
        recordedAt: new Date(startedAt),
        target: {
          canvasId,
          ...(binding?.getTarget() ?? { center: { x: 0, y: 0 }, zIndex: 1 }),
        },
      };
      set({ phase: "saving", uploadPercent: 0 });
      deps?.recorder.stop();
    },

    onRecorded: (blob) => {
      if (!pending || pending.blob) return;
      pending.blob = blob;
      void save();
    },

    discard: () => {
      session++;
      deps?.recorder.reset();
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
