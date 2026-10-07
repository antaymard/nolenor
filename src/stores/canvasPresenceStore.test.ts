import { beforeEach, describe, expect, test } from "vitest";
import type { PresenceState } from "@convex-dev/presence/react";
import { useCanvasPresenceStore } from "./canvasPresenceStore";

const ME = "me";

function state(
  userId: string,
  tab: string,
  selectedNodeIds: string[],
  extra: Partial<PresenceState> = {},
): PresenceState {
  return {
    userId: `${userId}:${tab}`,
    online: true,
    lastDisconnected: 0,
    data: { selectedNodeIds },
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

    const { collaborators, selectionsByNodeId } =
      useCanvasPresenceStore.getState();
    expect(collaborators.map((c) => c.userId)).toEqual(["alice"]);
    expect([...selectionsByNodeId.keys()].sort()).toEqual(["n1", "n2"]);
    expect(selectionsByNodeId.get("n1")?.map((c) => c.userId)).toEqual([
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
    expect(after.selectionsByNodeId.get("n1")).toBe(
      before.selectionsByNodeId.get("n1"),
    );
    expect(after.selectionsByNodeId.has("n2")).toBe(false);
    expect(after.selectionsByNodeId.get("n3")?.[0].userId).toBe("bob");

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
    const { collaborators, selectionsByNodeId } =
      useCanvasPresenceStore.getState();
    expect(collaborators).toHaveLength(1);
    expect(selectionsByNodeId.size).toBe(0);
  });
});
