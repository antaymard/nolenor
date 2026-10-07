/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import presenceTest from "@convex-dev/presence/test";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";
import { makePresenceUserId } from "./lib/presenceIds";

function setup() {
  const t = convexTest(schema, modules);
  presenceTest.register(t);
  return t;
}

async function seed(t: ReturnType<typeof setup>) {
  return t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", { displayName: "Owner" });
    const guest = await ctx.db.insert("users", {
      name: "Guest",
      image: "https://example.com/guest.png",
    });
    const stranger = await ctx.db.insert("users", {});
    const canvasId = await ctx.db.insert("canvases", {
      creatorId: owner,
      name: "Canvas",
      updatedAt: Date.now(),
      isPublic: true,
    });
    await ctx.db.insert("shares", {
      resourceType: "canvas",
      canvasId,
      userId: guest,
      permission: "viewer",
      grantedBy: owner,
    });
    return { owner, guest, stranger, canvasId };
  });
}

const as = (t: ReturnType<typeof setup>, userId: string) =>
  t.withIdentity({ subject: `${userId}|session` });

describe("canvas presence", () => {
  test("members join the room and see each other's profile", async () => {
    const t = setup();
    const { owner, guest, canvasId } = await seed(t);

    const ownerTokens = await as(t, owner).mutation(api.presence.heartbeat, {
      roomId: canvasId,
      userId: makePresenceUserId(owner, "tab-a"),
      sessionId: "s1",
      interval: 10_000,
    });
    await as(t, guest).mutation(api.presence.heartbeat, {
      roomId: canvasId,
      userId: makePresenceUserId(guest, "tab-b"),
      sessionId: "s2",
      interval: 10_000,
    });

    const states = await t.query(api.presence.list, {
      roomToken: ownerTokens.roomToken,
    });
    expect(
      states
        .map(({ userId, online, name, image }) => ({ userId, online, name, image }))
        .sort((a, b) => a.userId.localeCompare(b.userId)),
    ).toEqual(
      [
        {
          userId: makePresenceUserId(owner, "tab-a"),
          online: true,
          name: "Owner",
          image: undefined,
        },
        {
          userId: makePresenceUserId(guest, "tab-b"),
          online: true,
          name: "Guest",
          image: "https://example.com/guest.png",
        },
      ].sort((a, b) => a.userId.localeCompare(b.userId)),
    );
  });

  test("a public-canvas visitor who is not a member is refused", async () => {
    const t = setup();
    const { stranger, canvasId } = await seed(t);

    await expect(
      as(t, stranger).mutation(api.presence.heartbeat, {
        roomId: canvasId,
        userId: makePresenceUserId(stranger, "tab"),
        sessionId: "s",
        interval: 10_000,
      }),
    ).rejects.toThrow();
  });

  test("a client cannot join under someone else's identity", async () => {
    const t = setup();
    const { owner, guest, canvasId } = await seed(t);

    await expect(
      as(t, guest).mutation(api.presence.heartbeat, {
        roomId: canvasId,
        userId: makePresenceUserId(owner, "tab"),
        sessionId: "s",
        interval: 10_000,
      }),
    ).rejects.toThrow();
  });

  test("an unauthenticated client is refused", async () => {
    const t = setup();
    const { owner, canvasId } = await seed(t);

    await expect(
      t.mutation(api.presence.heartbeat, {
        roomId: canvasId,
        userId: makePresenceUserId(owner, "tab"),
        sessionId: "s",
        interval: 10_000,
      }),
    ).rejects.toThrow();
  });

  test("a member publishes selected and open nodes, others read them", async () => {
    const t = setup();
    const { owner, guest, canvasId } = await seed(t);
    const guestPresenceId = makePresenceUserId(guest, "tab");

    const { roomToken } = await as(t, guest).mutation(api.presence.heartbeat, {
      roomId: canvasId,
      userId: guestPresenceId,
      sessionId: "s",
      interval: 10_000,
    });
    await as(t, guest).mutation(api.presence.updateActivity, {
      roomId: canvasId,
      userId: guestPresenceId,
      selectedNodeIds: ["n1", "n2"],
      openNodeIds: ["n3"],
    });

    const states = await t.query(api.presence.list, { roomToken });
    expect(states.find((s) => s.userId === guestPresenceId)?.data).toEqual({
      selectedNodeIds: ["n1", "n2"],
      openNodeIds: ["n3"],
    });

    // Nobody publishes under someone else's presence id.
    await expect(
      as(t, owner).mutation(api.presence.updateActivity, {
        roomId: canvasId,
        userId: guestPresenceId,
        selectedNodeIds: [],
        openNodeIds: [],
      }),
    ).rejects.toThrow();
  });

  test("the home lists, per canvas of mine, the other members online", async () => {
    const t = setup();
    const { owner, guest, stranger, canvasId } = await seed(t);
    const strangerCanvas = await t.run((ctx) =>
      ctx.db.insert("canvases", {
        creatorId: stranger,
        name: "Stranger's",
        updatedAt: Date.now(),
      }),
    );
    const join = (userId: string, roomId: string, tab: string) =>
      as(t, userId).mutation(api.presence.heartbeat, {
        roomId,
        userId: makePresenceUserId(userId, tab),
        sessionId: `${userId}-${tab}`,
        interval: 10_000,
      });

    await join(owner, canvasId, "a");
    // Two tabs: listed once.
    await join(guest, canvasId, "a");
    await join(guest, canvasId, "b");
    await join(stranger, strangerCanvas, "a");

    // The owner sees the guest, not themself, nor the stranger's canvas.
    expect(await as(t, owner).query(api.presence.listMyCanvases, {})).toEqual([
      {
        canvasId,
        collaborators: [
          {
            userId: guest,
            name: "Guest",
            image: "https://example.com/guest.png",
          },
        ],
      },
    ]);
    // A shared canvas counts too.
    expect(await as(t, guest).query(api.presence.listMyCanvases, {})).toEqual([
      { canvasId, collaborators: [{ userId: owner, name: "Owner" }] },
    ]);
    // Alone on their own canvas: nothing to show.
    expect(
      await as(t, stranger).query(api.presence.listMyCanvases, {}),
    ).toEqual([]);
    await expect(t.query(api.presence.listMyCanvases, {})).rejects.toThrow();
  });

  describe("pruneRoom", () => {
    afterEach(() => vi.useRealTimers());

    test("removes long-gone tabs, keeps recent ones and those online", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-10-08T10:00:00Z"));
      const t = setup();
      const { owner, guest, canvasId } = await seed(t);
      const join = (userId: string, tab: string) =>
        as(t, userId).mutation(api.presence.heartbeat, {
          roomId: canvasId,
          userId: makePresenceUserId(userId, tab),
          sessionId: `${userId}-${tab}`,
          interval: 10_000,
        });
      const leave = (sessionToken: string) =>
        t.mutation(api.presence.disconnect, { sessionToken });

      // Two tabs left at 10:00, one at 10:08; the owner stays.
      await leave((await join(guest, "old-1")).sessionToken);
      await leave((await join(guest, "old-2")).sessionToken);
      vi.setSystemTime(new Date("2026-10-08T10:08:00Z"));
      await leave((await join(guest, "recent")).sessionToken);
      const { roomToken } = await join(owner, "here");

      vi.setSystemTime(new Date("2026-10-08T10:10:00Z"));
      expect(
        await as(t, owner).mutation(api.presence.pruneRoom, {
          roomId: canvasId,
          userId: makePresenceUserId(owner, "here"),
        }),
      ).toBe(2);

      const left = await t.query(api.presence.list, { roomToken });
      expect(left.map((p) => p.userId).sort()).toEqual(
        [
          makePresenceUserId(guest, "recent"),
          makePresenceUserId(owner, "here"),
        ].sort(),
      );
    });

    test("only a participant of the room can prune it", async () => {
      const t = setup();
      const { owner, stranger, canvasId } = await seed(t);
      await expect(
        as(t, stranger).mutation(api.presence.pruneRoom, {
          roomId: canvasId,
          userId: makePresenceUserId(stranger, "tab"),
        }),
      ).rejects.toThrow();
      await expect(
        as(t, stranger).mutation(api.presence.pruneRoom, {
          roomId: canvasId,
          userId: makePresenceUserId(owner, "tab"),
        }),
      ).rejects.toThrow();
    });
  });
});
