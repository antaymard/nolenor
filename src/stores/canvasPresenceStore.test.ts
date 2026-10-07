import { beforeEach, describe, expect, test } from "vitest";
import type { PresenceState } from "@convex-dev/presence/react";
import { useCanvasPresenceStore } from "./canvasPresenceStore";

const ME = "me";

function state(
  userId: string,
  tab: string,
  selectedNodeIds: string[],
  extra: Partial<PresenceState> = {},
  openNodeIds: string[] = [],
): PresenceState {
  return {
    userId: `${userId}:${tab}`,
    online: true,
    lastDisconnected: 0,
    data: { selectedNodeIds, openNodeIds },
    name: userId.toUpperCase(),
    ...extra,
  };
}

describe("canvasPresenceStore", () => {
  beforeEach(() => useCanvasPresenceStore.getState().reset());

  test("groups tabs per user, skips me and offline participants", () => {
    useCanvasPresenceStore.getState().setPresence(
      [
        state(ME, "a", ["n1"]),
        state("alice", "a", ["n1"]),
        state("alice", "b", ["n2"]),
        state("bob", "a", ["n1"], { online: false }),
      ],
      ME,
    );

    const { collaborators, collaboratorsByNodeId } =
      useCanvasPresenceStore.getState();
    expect(collaborators.map((c) => c.userId)).toEqual(["alice"]);
    expect([...collaboratorsByNodeId.keys()].sort()).toEqual(["n1", "n2"]);
    expect(collaboratorsByNodeId.get("n1")?.map((c) => c.userId)).toEqual([
      "alice",
    ]);
  });

  test("keeps references stable for unchanged nodes", () => {
    const { setPresence } = useCanvasPresenceStore.getState();
    setPresence(
      [state("alice", "a", ["n1"]), state("bob", "a", ["n2"])],
      ME,
    );
    const before = useCanvasPresenceStore.getState();

    setPresence(
      [state("alice", "a", ["n1"]), state("bob", "a", ["n3"])],
      ME,
    );
    const after = useCanvasPresenceStore.getState();

    expect(after.collaborators).toBe(before.collaborators);
    expect(after.collaboratorsByNodeId.get("n1")).toBe(
      before.collaboratorsByNodeId.get("n1"),
    );
    expect(after.collaboratorsByNodeId.has("n2")).toBe(false);
    expect(after.collaboratorsByNodeId.get("n3")?.[0].userId).toBe("bob");

    // Same input again: no store update at all.
    setPresence(
      [state("alice", "a", ["n1"]), state("bob", "a", ["n3"])],
      ME,
    );
    expect(useCanvasPresenceStore.getState()).toBe(after);
  });

  test("ignores malformed presence data", () => {
    useCanvasPresenceStore
      .getState()
      .setPresence([state("alice", "a", [], { data: "nope" })], ME);
    const { collaborators, collaboratorsByNodeId } =
      useCanvasPresenceStore.getState();
    expect(collaborators).toHaveLength(1);
    expect(collaboratorsByNodeId.size).toBe(0);
  });

  test("a node open in a window counts like a selected one, once per user", () => {
    useCanvasPresenceStore.getState().setPresence(
      [
        // Alice selected n1 in one tab and has it open in another.
        state("alice", "a", ["n1"]),
        state("alice", "b", [], {}, ["n1", "n2"]),
        state("bob", "a", [], {}, ["n2"]),
      ],
      ME,
    );
    const { collaboratorsByNodeId } = useCanvasPresenceStore.getState();
    expect(collaboratorsByNodeId.get("n1")?.map((c) => c.userId)).toEqual([
      "alice",
    ]);
    expect(collaboratorsByNodeId.get("n2")?.map((c) => c.userId)).toEqual([
      "alice",
      "bob",
    ]);
  });
});
