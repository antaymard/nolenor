// @vitest-environment jsdom
import { describe, expect, test } from "vitest";
import * as BlockNoteCore from "@blocknote/core";
import { BlockNoteEditor, nodeToBlock } from "@blocknote/core";
import type { Schema } from "@tiptap/pm/model";
import {
  blocksToProsemirrorDoc,
  createServerBlockNoteSchema,
} from "@/../convex/lib/blockNoteServerSchema";
import { blockNoteSchema } from "./schema";

// Le doc collaboratif est échangé en JSON ProseMirror entre les éditeurs du
// client (specs React) et le serveur (specs core, convex/lib/
// blockNoteServerSchema.ts). Les deux schémas doivent être identiques.

function describeSchema(schema: Schema) {
  const nodes: Record<string, unknown> = {};
  schema.spec.nodes.forEach((name, spec) => {
    nodes[name] = {
      content: spec.content ?? null,
      group: spec.group ?? null,
      inline: spec.inline ?? false,
      atom: spec.atom ?? false,
      marks: spec.marks ?? null,
      attrs: Object.fromEntries(
        Object.entries(spec.attrs ?? {}).map(([key, attr]) => [
          key,
          (attr as { default?: unknown }).default ?? null,
        ]),
      ),
    };
  });
  const marks: string[] = [];
  schema.spec.marks.forEach((name) => marks.push(name));
  return { nodes, marks: marks.sort() };
}

function headless(schema: unknown) {
  return BlockNoteEditor.create({
    schema: schema as typeof blockNoteSchema,
    _headless: true,
  });
}

describe("BlockNote sync schema", () => {
  test("server schema matches the client schema", () => {
    const client = headless(blockNoteSchema);
    const server = headless(createServerBlockNoteSchema(BlockNoteCore));
    expect(describeSchema(server.pmSchema)).toEqual(
      describeSchema(client.pmSchema),
    );
  });

  test("custom blocks round-trip from client to server", () => {
    const blocks = [
      {
        id: "b1",
        type: "callout",
        props: { color: "blue", icon: "🔥" },
        content: [
          { type: "text", text: "Due ", styles: { bold: true } },
          { type: "date", props: { date: "2026-10-07" } },
          { type: "pill", props: { text: "wip", color: "red", variant: "solid" } },
          { type: "mention", props: { nodeDataId: "abc", title: "Plan" } },
        ],
      },
    ];
    const client = BlockNoteEditor.create({
      schema: blockNoteSchema,
      initialContent: blocks as never,
    });
    const json = client.prosemirrorState.doc.toJSON();

    const server = headless(createServerBlockNoteSchema(BlockNoteCore));
    const doc = server.pmSchema.nodeFromJSON(json);
    const roundTripped = [] as unknown[];
    doc.firstChild?.forEach((node) => {
      roundTripped.push(nodeToBlock(node, server.pmSchema));
    });

    expect(roundTripped).toEqual(client.document);
  });

  test("stored blocks become the same ProseMirror doc as the client editor's", () => {
    const blocks = [
      { id: "h", type: "heading", props: { level: 2 }, content: "Title" },
      {
        id: "p",
        type: "paragraph",
        content: [{ type: "pill", props: { text: "ok", color: "green" } }],
        children: [{ id: "c", type: "bulletListItem", content: "nested" }],
      },
    ];
    const client = BlockNoteEditor.create({
      schema: blockNoteSchema,
      initialContent: blocks as never,
    });
    const server = headless(createServerBlockNoteSchema(BlockNoteCore));

    const doc = blocksToProsemirrorDoc(BlockNoteCore, server, client.document);
    expect(doc.toJSON()).toEqual(client.prosemirrorState.doc.toJSON());
  });

  test("an empty document becomes a single empty paragraph", () => {
    const server = headless(createServerBlockNoteSchema(BlockNoteCore));
    const doc = blocksToProsemirrorDoc(BlockNoteCore, server, []);
    expect(doc.firstChild?.childCount).toBe(1);
    expect(nodeToBlock(doc.firstChild!.firstChild!, server.pmSchema).type).toBe(
      "paragraph",
    );
  });
});
