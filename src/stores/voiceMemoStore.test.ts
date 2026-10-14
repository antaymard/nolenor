import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  isVoiceMemoUnsaved,
  registerVoiceMemoBinding,
  registerVoiceMemoDeps,
  useVoiceMemoStore,
  type VoiceMemoDeps,
} from "./voiceMemoStore";

const CANVAS = "canvas_a" as Id<"canvases">;

class FakeTrack {
  stopped = false;
  onended: (() => void) | null = null;
  stop() {
    this.stopped = true;
  }
}

let track: FakeTrack;

class FakeMediaRecorder {
  static isTypeSupported = (mime: string) => mime === "audio/webm";
  mimeType = "audio/webm;codecs=opus";
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["sound"]) });
    queueMicrotask(() => this.onstop?.());
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function makeDeps(overrides: Partial<VoiceMemoDeps> = {}) {
  const deps: VoiceMemoDeps = {
    uploadFile: vi.fn(async (file: File) => ({
      url: "https://files/x",
      filename: file.name,
      mimeType: file.type,
      size: file.size,
      uploadedAt: 1,
      key: "k",
    })),
    buildValues: vi.fn((uploaded, meta) => ({ audio: { ...uploaded, ...meta } })),
    createOnServer: vi.fn(async () => {}),
    onSavedElsewhere: vi.fn(),
    ...overrides,
  };
  return deps;
}

let cleanups: Array<() => void> = [];

beforeEach(() => {
  track = new FakeTrack();
  vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  // No AudioContext in this environment: the level meter is skipped.
  vi.stubGlobal("AudioContext", undefined);
  vi.stubGlobal("navigator", {
    mediaDevices: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [track],
        getAudioTracks: () => [track],
      })),
    },
  });
});

afterEach(() => {
  useVoiceMemoStore.getState().discard();
  cleanups.forEach((fn) => fn());
  cleanups = [];
  vi.unstubAllGlobals();
});

describe("voiceMemoStore", () => {
  test("stop creates the node on the canvas still open, at the stop-time target", async () => {
    const deps = makeDeps();
    const create = vi.fn(async () => {});
    cleanups.push(registerVoiceMemoDeps(deps));
    cleanups.push(
      registerVoiceMemoBinding(CANVAS, {
        getTarget: () => ({ center: { x: 10, y: 20 }, zIndex: 7 }),
        create,
      }),
    );

    await useVoiceMemoStore.getState().start(CANVAS);
    expect(useVoiceMemoStore.getState().phase).toBe("recording");
    expect(useVoiceMemoStore.getState().isPanelOpen).toBe(true);

    useVoiceMemoStore.getState().stop();
    await flush();

    expect(track.stopped).toBe(true);
    const file = vi.mocked(deps.uploadFile).mock.calls[0][0];
    expect(file.type).toBe("audio/webm");
    expect(file.name).toMatch(/^voice-memo-.*\.webm$/);
    expect(create).toHaveBeenCalledWith(expect.anything(), {
      canvasId: CANVAS,
      center: { x: 10, y: 20 },
      zIndex: 7,
    });
    expect(deps.createOnServer).not.toHaveBeenCalled();
    expect(useVoiceMemoStore.getState().phase).toBe("idle");
    expect(useVoiceMemoStore.getState().isPanelOpen).toBe(false);
  });

  test("leaving the canvas: target read before unbinding, node created on the server", async () => {
    const deps = makeDeps();
    cleanups.push(registerVoiceMemoDeps(deps));
    const unbind = registerVoiceMemoBinding(CANVAS, {
      getTarget: () => ({ center: { x: 1, y: 2 }, zIndex: 3 }),
      create: vi.fn(async () => {}),
    });

    await useVoiceMemoStore.getState().start(CANVAS);
    // What `useVoiceMemoCanvasBinding` does on unmount.
    useVoiceMemoStore.getState().stop();
    unbind();
    await flush();

    expect(deps.createOnServer).toHaveBeenCalledWith(expect.anything(), {
      canvasId: CANVAS,
      center: { x: 1, y: 2 },
      zIndex: 3,
    });
    expect(deps.onSavedElsewhere).toHaveBeenCalled();
    expect(useVoiceMemoStore.getState().phase).toBe("idle");
  });

  test("a failed upload keeps the recording for a retry and blocks a new one", async () => {
    let fail = true;
    const deps = makeDeps();
    const upload = deps.uploadFile;
    deps.uploadFile = vi.fn(async (file, onProgress) => {
      if (fail) throw new Error("network");
      return upload(file, onProgress);
    });
    cleanups.push(registerVoiceMemoDeps(deps));

    await useVoiceMemoStore.getState().start(CANVAS);
    useVoiceMemoStore.getState().stop();
    await flush();

    const state = useVoiceMemoStore.getState();
    expect(state.phase).toBe("error");
    expect(state.hasPendingSave).toBe(true);
    expect(isVoiceMemoUnsaved(state)).toBe(true);

    await useVoiceMemoStore.getState().start(CANVAS);
    expect(useVoiceMemoStore.getState().phase).toBe("error");

    fail = false;
    useVoiceMemoStore.getState().retrySave();
    await flush();
    expect(deps.createOnServer).toHaveBeenCalledTimes(1);
    expect(useVoiceMemoStore.getState().phase).toBe("idle");
    expect(isVoiceMemoUnsaved(useVoiceMemoStore.getState())).toBe(false);
  });

  test("a refused microphone shows the message and records nothing", async () => {
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn(async () => {
          throw new DOMException("denied", "NotAllowedError");
        }),
      },
    });

    await useVoiceMemoStore.getState().start(CANVAS);
    const state = useVoiceMemoStore.getState();
    expect(state.phase).toBe("error");
    expect(state.error).toMatch(/Microphone access denied/);
    expect(state.hasPendingSave).toBe(false);
  });

  test("discard drops the recording without saving", async () => {
    const deps = makeDeps();
    cleanups.push(registerVoiceMemoDeps(deps));

    await useVoiceMemoStore.getState().start(CANVAS);
    useVoiceMemoStore.getState().discard();
    await flush();

    expect(track.stopped).toBe(true);
    expect(deps.uploadFile).not.toHaveBeenCalled();
    expect(useVoiceMemoStore.getState().phase).toBe("idle");
  });
});
