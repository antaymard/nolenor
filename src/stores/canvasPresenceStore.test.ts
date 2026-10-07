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

  test("a node open in a window shows its collaborators, once per user", () => {
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
    const activities = (nodeId: string) =>
      collaboratorsByNodeId
        .get(nodeId)
        ?.map(({ userId, activity }) => ({ userId, activity }));
    // Open in a window wins over selected, for the same user.
    expect(activities("n1")).toEqual([{ userId: "alice", activity: "open" }]);
    expect(activities("n2")).toEqual([
      { userId: "alice", activity: "open" },
      { userId: "bob", activity: "open" },
    ]);
    expect(activities("n3")).toBeUndefined();
  });

  test("an activity change alone re-renders the node", () => {
    const { setPresence } = useCanvasPresenceStore.getState();
    setPresence([state("alice", "a", ["n1"])], ME);
    const before = useCanvasPresenceStore.getState().collaboratorsByNodeId.get("n1");
    expect(before?.[0].activity).toBe("selected");

    setPresence([state("alice", "a", ["n1"], {}, ["n1"])], ME);
    const after = useCanvasPresenceStore.getState().collaboratorsByNodeId.get("n1");
    expect(after).not.toBe(before);
    expect(after?.[0].activity).toBe("open");
  });
});
