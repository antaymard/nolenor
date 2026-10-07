import { describe, expect, it } from "vitest";
import type { NoleNodeActivity } from "@/stores/noleLiveStore";
import {
  activitiesFromSnapshot,
  FADE_MS,
  holdActivities,
  MIN_LIVE_MS,
  type HeldActivity,
} from "./noleLiveActivity";

const read = (label: string | null = "Reading"): NoleNodeActivity => ({
  access: "read",
  label,
});

function step(
  previous: Map<string, HeldActivity>,
  incoming: Record<string, NoleNodeActivity>,
  now: number,
) {
  return holdActivities(previous, new Map(Object.entries(incoming)), now);
}

describe("activitiesFromSnapshot", () => {
  it("keeps the strongest state and the last finished label", () => {
    const byNodeId = activitiesFromSnapshot({
      calls: [{ access: "read", explanation: "Reading", nodeIds: ["a"] }],
      written: [{ nodeId: "a" }, { nodeId: "b" }],
      done: [
        { nodeId: "b", access: "write", label: "Updated the table" },
        { nodeId: "c", access: "read", label: "Read the brief" },
      ],
    });
    expect(byNodeId.get("a")).toEqual({ access: "read", label: "Reading" });
    expect(byNodeId.get("b")).toEqual({
      access: "written",
      label: "Updated the table",
    });
    expect(byNodeId.get("c")).toEqual({
      access: "seen",
      label: "Read the brief",
    });
  });
});

describe("holdActivities", () => {
  it("holds a short live call for the minimum duration", () => {
    const first = step(new Map(), { a: read() }, 0);
    expect(first.wakeAt).toBe(MIN_LIVE_MS);

    // The call ended 100 ms later: still shown as live.
    const second = step(
      first.held,
      { a: { access: "seen", label: "Reading" } },
      100,
    );
    expect(second.display.get("a")?.access).toBe("read");

    // Past the hold: the finished state takes over.
    const third = step(
      second.held,
      { a: { access: "seen", label: "Reading" } },
      MIN_LIVE_MS,
    );
    expect(third.display.get("a")).toEqual({ access: "seen", label: "Reading" });
  });

  it("lets a new live call replace a held one at once", () => {
    const first = step(new Map(), { a: read() }, 0);
    const second = step(
      first.held,
      { a: { access: "write", label: "Writing" } },
      100,
    );
    expect(second.display.get("a")?.access).toBe("write");
    expect(second.wakeAt).toBe(100 + MIN_LIVE_MS);
  });

  it("does not restart the hold while the same call is still running", () => {
    const first = step(new Map(), { a: read() }, 0);
    const second = step(first.held, { a: read() }, 1000);
    expect(second.wakeAt).toBe(MIN_LIVE_MS);
  });

  it("fades a node out when the run ends, then drops it", () => {
    const first = step(new Map(), { a: { access: "written", label: null } }, 0);
    const leaving = step(first.held, {}, 10);
    expect(leaving.display.get("a")).toEqual({
      access: "written",
      label: null,
      leaving: true,
    });
    expect(leaving.wakeAt).toBe(10 + FADE_MS);

    const gone = step(leaving.held, {}, 10 + FADE_MS);
    expect(gone.display.size).toBe(0);
    expect(gone.wakeAt).toBeNull();
  });

  it("brings a fading node back when activity resumes", () => {
    const first = step(new Map(), { a: { access: "seen", label: null } }, 0);
    const leaving = step(first.held, {}, 10);
    const back = step(leaving.held, { a: read() }, 20);
    expect(back.display.get("a")).toEqual(read());
  });
});
