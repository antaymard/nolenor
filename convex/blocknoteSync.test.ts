/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import prosemirrorSyncTest from "@convex-dev/prosemirror-sync/test";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import { modules } from "./test.setup";
import * as NodeDataModel from "./models/nodeDataModels";

const PM_DOC = JSON.stringify({
  type: "doc",
  content: [{ type: "blockGroup", content: [] }],
});
const BLOCKS = [
  { id: "b1", type: "paragraph", props: {}, content: [], children: [] },
];

function setup() {
  const t = convexTest(schema, modules);
  prosemirrorSyncTest.register(t);
  return t;
}

async function seed(t: ReturnType<typeof setup>) {
  return t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {});
    const reader = await ctx.db.insert("users", {});
    const canvasId = await ctx.db.insert("canvases", {
      creatorId: owner,
      name: "Canvas",
      updatedAt: Date.now(),
    });
    await ctx.db.insert("shares", {
      resourceType: "canvas",
      canvasId,
      userId: reader,
      permission: "viewer",
      grantedBy: owner,
    });
    const nodeDataId = await ctx.db.insert("nodeDatas", {
      canvasId,
      type: "blocknote",
      updatedAt: Date.now(),
      values: { doc: JSON.stringify(BLOCKS) },
    });
    return { owner, reader, nodeDataId };
  });
}

const as = (t: ReturnType<typeof setup>, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|session` });

async function scheduledPushes(t: ReturnType<typeof setup>) {
  return t.run(async (ctx) => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();
    return jobs.filter((job) => job.name.includes("pushDocToSync")).length;
  });
}

describe("blocknote sync", () => {
  test("viewers read the live doc, only editors write it", async () => {
    const t = setup();
    const { owner, reader, nodeDataId } = await seed(t);

    await expect(
      as(t, reader).mutation(api.blocknoteSync.submitSnapshot, {
        id: nodeDataId,
        version: 1,
        content: PM_DOC,
      }),
    ).rejects.toThrow();

    await as(t, owner).mutation(api.blocknoteSync.submitSnapshot, {
      id: nodeDataId,
      version: 1,
      content: PM_DOC,
    });
    const snapshot = await as(t, reader).query(api.blocknoteSync.getSnapshot, {
      id: nodeDataId,
    });
    expect(snapshot).toEqual({ content: PM_DOC, version: 1 });

    const stranger = await t.run((ctx) => ctx.db.insert("users", {}));
    await expect(
      as(t, stranger).query(api.blocknoteSync.getSnapshot, { id: nodeDataId }),
    ).rejects.toThrow();
  });

  test("publishDoc only lands at the latest version", async () => {
    const t = setup();
    const { owner, nodeDataId } = await seed(t);
    await as(t, owner).mutation(api.blocknoteSync.submitSnapshot, {
      id: nodeDataId,
      version: 1,
      content: PM_DOC,
    });

    const next = [{ ...BLOCKS[0], id: "b2" }];
    expect(
      await as(t, owner).mutation(api.blocknoteSync.publishDoc, {
        nodeDataId,
        version: 0,
        doc: next,
      }),
    ).toBe(false);
    expect(
      await as(t, owner).mutation(api.blocknoteSync.publishDoc, {
        nodeDataId,
        version: 1,
        doc: next,
      }),
    ).toBe(true);

    const stored = await t.run((ctx) => ctx.db.get(nodeDataId));
    expect(JSON.parse(stored!.values.doc as string)[0].id).toBe("b2");
    // Published from the live doc: nothing to push back.
    expect(await scheduledPushes(t)).toBe(0);
  });

  test("other writes are pushed to the live doc, only once it exists", async () => {
    const t = setup();
    const { owner, nodeDataId } = await seed(t);
    const write = (id: string) =>
      t.run((ctx) =>
        NodeDataModel.updateValues(ctx, {
          _id: nodeDataId,
          values: { doc: [{ ...BLOCKS[0], id }] },
          actor: { type: "system" },
        }),
      );

    await write("before-sync");
    expect(await scheduledPushes(t)).toBe(0);

    await as(t, owner).mutation(api.blocknoteSync.submitSnapshot, {
      id: nodeDataId,
      version: 1,
      content: PM_DOC,
    });
    await write("agent");
    expect(await scheduledPushes(t)).toBe(1);
  });
});
