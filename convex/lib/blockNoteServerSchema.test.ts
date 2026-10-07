// @vitest-environment node
import { beforeAll, describe, expect, test } from "vitest";
import type * as BlockNoteCore from "@blocknote/core";
import {
  blocksToProsemirrorDoc,
  createServerBlockNoteSchema,
} from "./blockNoteServerSchema";

// Le schéma serveur et la conversion blocs <-> ProseMirror tournent-ils sans
// DOM ? Environnement Node pur : pas de jsdom, ni `window` ni `document`.
//
// `@blocknote/core` et ses dépendances LISENT ces globales au chargement et à
// la création de l'éditeur, mais toutes derrière une garde `typeof X !==
// "undefined"` (relevé par piles d'appel : prosemirror-view, -commands,
// -keymap, w3c-keyname, lib0, l'`element` par défaut de l'Editor Tiptap, le
// `generateID` de BlockNote). Un piège qui lève sur accès casserait ces
// gardes elles-mêmes ; on vérifie donc ce qui compte : rien ne plante, et
// aucune globale DOM n'est installée en passant.

let core: typeof BlockNoteCore;

beforeAll(async () => {
  expect(typeof window).toBe("undefined");
  expect(typeof document).toBe("undefined");
  core = await import("@blocknote/core");
});

const BLOCKS = [
  {
    id: "callout",
    type: "callout",
    props: { color: "blue", icon: "🔥" },
    content: [
      { type: "text", text: "Due ", styles: { bold: true } },
      { type: "date", props: { date: "2026-10-07" } },
      { type: "text", text: " ", styles: {} },
      { type: "pill", props: { text: "wip", color: "red", variant: "solid" } },
      { type: "text", text: " ", styles: {} },
      { type: "mention", props: { nodeDataId: "abc", title: "Plan" } },
    ],
    children: [],
  },
  {
    id: "para",
    type: "paragraph",
    props: { backgroundColor: "default", textColor: "default", textAlignment: "left" },
    content: [{ type: "text", text: "plain", styles: {} }],
    children: [],
  },
];

describe("BlockNote server schema without a DOM", () => {
  test("loading @blocknote/core installs no DOM globals", () => {
    expect(core.BlockNoteEditor).toBeTypeOf("function");
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  test("headless editor + blocks -> ProseMirror -> blocks round-trip", () => {
    const editor = core.BlockNoteEditor.create({
      schema: createServerBlockNoteSchema(core),
      _headless: true,
    });

    const doc = blocksToProsemirrorDoc(core, editor, BLOCKS);
    const roundTripped: unknown[] = [];
    doc.firstChild?.forEach((node) => {
      roundTripped.push(core.nodeToBlock(node, editor.pmSchema));
    });
    expect(roundTripped).toMatchObject(BLOCKS);

    // Par le JSON, comme un snapshot stocké par prosemirror-sync.
    const fromJson = editor.pmSchema.nodeFromJSON(doc.toJSON());
    expect(fromJson.eq(doc)).toBe(true);

    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });
});
