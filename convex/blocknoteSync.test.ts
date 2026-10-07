/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import prosemirrorSyncTest from "@convex-dev/prosemirror-sync/test";
import * as BlockNoteCore from "@blocknote/core";
import { Transform } from "@tiptap/pm/transform";
import { api, components, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import schema from "./schema";
import debouncerSchema from "./components/debouncer/schema";
import { modules } from "./test.setup";
import * as NodeDataModel from "./models/nodeDataModels";
import {
  blocksToProsemirrorDoc,
  createServerBlockNoteSchema,
} from "./lib/blockNoteServerSchema";

// Tourne dans l'environnement `edge-runtime` des tests Convex : la recopie
// charge `@blocknote/core` hors de Node, comme dans le runtime V8.

const paragraph = (id: string, text: string) => ({
  id,
  type: "paragraph",
  props: {
    backgroundColor: "default",
    textColor: "default",
    textAlignment: "left",
  },
  content: [{ type: "text", text, styles: {} }],
  children: [],
});
const INITIAL = [paragraph("b1", "hello")];
const EDITED = [paragraph("b1", "hello"), paragraph("b2", "world")];

const editor = BlockNoteCore.BlockNoteEditor.create({
  schema: createServerBlockNoteSchema(BlockNoteCore),
  _headless: true,
});
const toPm = (blocks: unknown[]) =>
  blocksToProsemirrorDoc(BlockNoteCore, editor, blocks);

/** Les steps qui font passer le doc de `from` à `to`, comme un éditeur. */
function stepsBetween(from: unknown[], to: unknown[]): string[] {
  const current = toPm(from);
  const tr = new Transform(current);
  tr.replaceWith(0, current.content.size, toPm(to).content);
  return tr.steps.map((step) => JSON.stringify(step.toJSON()));
}

function setup() {
  const t = convexTest(schema, modules);
  prosemirrorSyncTest.register(t);
  t.registerComponent(
    "debouncer",
    debouncerSchema,
    import.meta.glob("./components/debouncer/**/*.ts"),
  );
  return t;
}
type T = ReturnType<typeof setup>;

async function seed(t: T) {
  return t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {});
    const reader = await ctx.db.insert("users", {});
    const coEditor = await ctx.db.insert("users", {});
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
    await ctx.db.insert("shares", {
      resourceType: "canvas",
      canvasId,
      userId: coEditor,
      permission: "editor",
      grantedBy: owner,
    });
    const nodeDataId = await ctx.db.insert("nodeDatas", {
      canvasId,
      type: "blocknote",
      updatedAt: Date.now(),
      values: { doc: JSON.stringify(INITIAL) },
    });
    return { owner, reader, coEditor, nodeDataId };
  });
}

const as = (t: T, userId: Id<"users">) =>
  t.withIdentity({ subject: `${userId}|session` });

/** Crée le doc vivant depuis `INITIAL`, comme la première ouverture en sync. */
async function createLiveDoc(t: T, owner: Id<"users">, id: Id<"nodeDatas">) {
  await as(t, owner).mutation(api.blocknoteSync.submitSnapshot, {
    id,
    version: 1,
    content: JSON.stringify(toPm(INITIAL).toJSON()),
  });
}

async function scheduledPushes(t: T) {
  return t.run(async (ctx) => {
    const jobs = await ctx.db.system.query("_scheduled_functions").collect();
    return jobs.filter((job) => job.name.includes("pushDocToSync")).length;
  });
}

async function pendingCopy(t: T, nodeDataId: Id<"nodeDatas">) {
  return t.run((ctx) =>
    ctx.runQuery(components.debouncer.lib.status, {
      namespace: "blocknoteMaterialize:materializeLatest",
      key: nodeDataId,
    }),
  );
}

describe("blocknote sync", () => {
  test("viewers read the live doc, only editors write it", async () => {
    const t = setup();
    const { owner, reader, nodeDataId } = await seed(t);

    const content = JSON.stringify(toPm(INITIAL).toJSON());
    await expect(
      as(t, reader).mutation(api.blocknoteSync.submitSnapshot, {
        id: nodeDataId,
        version: 1,
        content,
      }),
    ).rejects.toThrow();
    await createLiveDoc(t, owner, nodeDataId);

    expect(
      await as(t, reader).query(api.blocknoteSync.getSnapshot, {
        id: nodeDataId,
      }),
    ).toEqual({ content, version: 1 });

    await expect(
      as(t, reader).mutation(api.blocknoteSync.submitSteps, {
        id: nodeDataId,
        version: 1,
        clientId: "reader",
        steps: stepsBetween(INITIAL, EDITED),
      }),
    ).rejects.toThrow();

    const stranger = await t.run((ctx) => ctx.db.insert("users", {}));
    await expect(
      as(t, stranger).query(api.blocknoteSync.getSnapshot, { id: nodeDataId }),
    ).rejects.toThrow();
  });

  test("accepted steps schedule a grouped copy into values.doc", async () => {
    const t = setup();
    const { owner, nodeDataId } = await seed(t);
    await createLiveDoc(t, owner, nodeDataId);
    expect(await pendingCopy(t, nodeDataId)).toBeNull();

    const steps = stepsBetween(INITIAL, EDITED);
    expect(
      await as(t, owner).mutation(api.blocknoteSync.submitSteps, {
        id: nodeDataId,
        version: 1,
        clientId: "owner",
        steps,
      }),
    ).toEqual({ status: "synced" });
    expect(await pendingCopy(t, nodeDataId)).toMatchObject({
      pending: true,
      calls: 1,
    });

    // Steps refused (stale version): nothing more to copy.
    const rebase = await as(t, owner).mutation(api.blocknoteSync.submitSteps, {
      id: nodeDataId,
      version: 1,
      clientId: "owner",
      steps,
    });
    expect(rebase.status).toBe("needs-rebase");
    expect(await pendingCopy(t, nodeDataId)).toMatchObject({ calls: 1 });
  });

  test("the copy writes the latest live doc, credited to the author", async () => {
    const t = setup();
    const { owner, nodeDataId } = await seed(t);
    await createLiveDoc(t, owner, nodeDataId);
    await as(t, owner).mutation(api.blocknoteSync.submitSteps, {
      id: nodeDataId,
      version: 1,
      clientId: "owner",
      steps: stepsBetween(INITIAL, EDITED),
    });

    await t.mutation(internal.blocknoteMaterialize.materializeLatest, {
      nodeDataId,
      userId: owner,
    });
    const stored = await t.run((ctx) => ctx.db.get(nodeDataId));
    expect(
      JSON.parse(stored!.values.doc as string).map(
        (block: { id: string }) => block.id,
      ),
    ).toEqual(["b1", "b2"]);

    const versions = await t.run((ctx) =>
      ctx.db.query("nodeDataVersions").collect(),
    );
    expect(versions.map((version) => version.actor)).toEqual([
      { type: "user", userId: owner },
    ]);
    // Written from the live doc: nothing to push back into it.
    expect(await scheduledPushes(t)).toBe(0);

    // Nothing changed since: no write at all.
    await t.mutation(internal.blocknoteMaterialize.materializeLatest, {
      nodeDataId,
      userId: owner,
    });
    const again = await t.run((ctx) => ctx.db.get(nodeDataId));
    expect(again!.updatedAt).toBe(stored!.updatedAt);
  });

  test("other writes are pushed to the live doc, only once it exists", async () => {
    const t = setup();
    const { owner, nodeDataId } = await seed(t);
    const write = (id: string) =>
      t.run((ctx) =>
        NodeDataModel.updateValues(ctx, {
          _id: nodeDataId,
          values: { doc: [paragraph(id, "agent")] },
          actor: { type: "system" },
        }),
      );

    await write("before-sync");
    expect(await scheduledPushes(t)).toBe(0);

    await createLiveDoc(t, owner, nodeDataId);
    await write("agent");
    expect(await scheduledPushes(t)).toBe(1);
  });

  test("co-editing humans share one version, an agent write opens a new one", async () => {
    const t = setup();
    const { owner, coEditor, nodeDataId } = await seed(t);
    await createLiveDoc(t, owner, nodeDataId);

    // One editing turn: steps, then the grouped copy credited to their author.
    const editAs = async (
      userId: Id<"users">,
      from: unknown[],
      to: unknown[],
    ) => {
      const version = await t.run((ctx) =>
        ctx.runQuery(components.prosemirrorSync.lib.latestVersion, {
          id: nodeDataId,
        }),
      );
      const result = await as(t, userId).mutation(
        api.blocknoteSync.submitSteps,
        {
          id: nodeDataId,
          version: version!,
          clientId: userId,
          steps: stepsBetween(from, to),
        },
      );
      expect(result.status).toBe("synced");
      await t.mutation(internal.blocknoteMaterialize.materializeLatest, {
        nodeDataId,
        userId,
      });
    };
    const versionActors = () =>
      t.run(async (ctx) =>
        (await ctx.db.query("nodeDataVersions").collect()).map(
          (version) => version.actor,
        ),
      );

    const second = [...EDITED, paragraph("b3", "from B")];
    const third = [...second, paragraph("b4", "from A again")];
    await editAs(owner, INITIAL, EDITED);
    await editAs(coEditor, EDITED, second);
    await editAs(owner, second, third);

    // Each copy did land...
    const stored = await t.run((ctx) => ctx.db.get(nodeDataId));
    expect(JSON.parse(stored!.values.doc as string)).toHaveLength(4);
    // ...but A and B alternating is one session: a single restore point,
    // holding the document from before it.
    expect(await versionActors()).toEqual([{ type: "user", userId: owner }]);

    await t.run((ctx) =>
      NodeDataModel.updateValues(ctx, {
        _id: nodeDataId,
        values: { doc: [paragraph("b1", "rewritten by Nolë")] },
        actor: { type: "agent", userId: owner, threadId: "thread" },
      }),
    );
    expect(await versionActors()).toEqual([
      { type: "user", userId: owner },
      { type: "agent", userId: owner, threadId: "thread" },
    ]);
  });
});
