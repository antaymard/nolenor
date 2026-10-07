/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
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

  test("a member publishes their selection, others read it from the room", async () => {
    const t = setup();
    const { owner, guest, canvasId } = await seed(t);
    const guestPresenceId = makePresenceUserId(guest, "tab");

    const { roomToken } = await as(t, guest).mutation(api.presence.heartbeat, {
      roomId: canvasId,
      userId: guestPresenceId,
      sessionId: "s",
      interval: 10_000,
    });
    await as(t, guest).mutation(api.presence.updateSelection, {
      roomId: canvasId,
      userId: guestPresenceId,
      selectedNodeIds: ["n1", "n2"],
    });

    const states = await t.query(api.presence.list, { roomToken });
    expect(states.find((s) => s.userId === guestPresenceId)?.data).toEqual({
      selectedNodeIds: ["n1", "n2"],
    });

    // Nobody publishes under someone else's presence id.
    await expect(
      as(t, owner).mutation(api.presence.updateSelection, {
        roomId: canvasId,
        userId: guestPresenceId,
        selectedNodeIds: [],
      }),
    ).rejects.toThrow();
  });
});
