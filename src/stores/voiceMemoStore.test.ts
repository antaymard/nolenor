import { afterEach, describe, expect, test, vi } from "vitest";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  isVoiceMemoUnsaved,
  registerVoiceMemoBinding,
  registerVoiceMemoDeps,
  useVoiceMemoStore,
  type VoiceMemoDeps,
} from "./voiceMemoStore";

const CANVAS = "canvas_a" as Id<"canvases">;

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** The recorder delivers its file on stop, as the controller does. */
function makeDeps(overrides: Partial<VoiceMemoDeps> = {}) {
  const deps: VoiceMemoDeps = {
    recorder: {
      start: vi.fn(async () => {}),
      stop: vi.fn(() =>
        queueMicrotask(() =>
          useVoiceMemoStore
            .getState()
            .onRecorded(new Blob(["sound"], { type: "audio/webm;codecs=opus" })),
        ),
      ),
      reset: vi.fn(),
    },
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
  cleanups.push(registerVoiceMemoDeps(deps));
  return deps;
}

let cleanups: Array<() => void> = [];

afterEach(() => {
  useVoiceMemoStore.getState().discard();
  cleanups.forEach((fn) => fn());
  cleanups = [];
});

describe("voiceMemoStore", () => {
  test("stop creates the node on the canvas still open, at the stop-time target", async () => {
    const deps = makeDeps();
    const create = vi.fn(async () => {});
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
    const deps = makeDeps();
    vi.mocked(deps.recorder.start).mockRejectedValueOnce(
      new Error("Microphone access denied."),
    );

    await useVoiceMemoStore.getState().start(CANVAS);
    const state = useVoiceMemoStore.getState();
    expect(state.phase).toBe("error");
    expect(state.error).toBe("Microphone access denied.");
    expect(state.hasPendingSave).toBe(false);
  });

  test("discard while waiting for the microphone stops the recorder once it starts", async () => {
    const deps = makeDeps();
    let grant!: () => void;
    vi.mocked(deps.recorder.start).mockReturnValueOnce(
      new Promise<void>((resolve) => (grant = resolve)),
    );

    const starting = useVoiceMemoStore.getState().start(CANVAS);
    useVoiceMemoStore.getState().discard();
    grant();
    await starting;

    expect(deps.recorder.reset).toHaveBeenCalledTimes(2);
    expect(deps.uploadFile).not.toHaveBeenCalled();
    expect(useVoiceMemoStore.getState().phase).toBe("idle");
  });
});
