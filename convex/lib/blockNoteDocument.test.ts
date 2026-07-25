import { describe, expect, it } from "vitest";

import {
  blockNoteDocumentHasText,
  deleteBlocks,
  extractInlineText,
  insertBlocks,
  listBlockIds,
  normalizeReplaceDocumentBlocks,
  parseStoredBlockNoteDocument,
  patchBlockText,
  replaceBlock,
  stringifyBlockNoteDocumentForStorage,
  updateBlockProps,
  validateBlockNoteDocument,
  type BlockNoteBlock,
} from "./blockNoteDocument";

// ── Fixtures ────────────────────────────────────────────────────────────────

function text(value: string, styles?: Record<string, unknown>) {
  return styles ? { type: "text", text: value, styles } : { type: "text", text: value };
}

function paragraph(id: string, value: string): BlockNoteBlock {
  return { id, type: "paragraph", content: [text(value)] };
}

/** Two top-level blocks, the second with a nested child. */
function sampleDoc(): BlockNoteBlock[] {
  return [
    { id: "h1", type: "heading", props: { level: 1 }, content: [text("Title")] },
    {
      id: "p1",
      type: "paragraph",
      content: [text("Hello world")],
      children: [paragraph("c1", "Nested")],
    },
  ];
}

describe("validateBlockNoteDocument", () => {
  it("accepts a well-formed document", () => {
    expect(() => validateBlockNoteDocument(sampleDoc())).not.toThrow();
  });

  it("rejects a non-array document", () => {
    expect(() => validateBlockNoteDocument({})).toThrow(/must be an array/);
  });

  it("rejects duplicate ids, including across nesting levels", () => {
    const doc = sampleDoc();
    doc[1].children![0].id = "h1";
    expect(() => validateBlockNoteDocument(doc)).toThrow(/Duplicate block id "h1"/);
  });

  it("reports the path of the offending block", () => {
    const doc = sampleDoc();
    delete (doc[1].children![0] as Partial<BlockNoteBlock>).type;
    expect(() => validateBlockNoteDocument(doc)).toThrow(/\[1\]\[children\]\[0\]/);
  });

  it("rejects malformed table content", () => {
    const doc: unknown[] = [
      { id: "t1", type: "table", content: { type: "tableContent", rows: "nope" } },
    ];
    expect(() => validateBlockNoteDocument(doc)).toThrow(/"rows" must be an array/);
  });

  it("accepts both structured and legacy table cells", () => {
    const doc: unknown[] = [
      {
        id: "t1",
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            { cells: [{ type: "tableCell", props: {}, content: [text("a")] }] },
            { cells: [[text("legacy")]] },
          ],
        },
      },
    ];
    expect(() => validateBlockNoteDocument(doc)).not.toThrow();
  });
});

describe("parse / stringify", () => {
  it("round-trips a document through storage", () => {
    const doc = sampleDoc();
    const stored = stringifyBlockNoteDocumentForStorage(doc);
    expect(parseStoredBlockNoteDocument(stored)).toEqual(doc);
  });

  it("returns null for unparseable input", () => {
    expect(parseStoredBlockNoteDocument("{not json")).toBeNull();
    expect(parseStoredBlockNoteDocument('{"a":1}')).toBeNull();
    expect(parseStoredBlockNoteDocument(42)).toBeNull();
  });

  it("refuses to serialize an invalid document", () => {
    expect(() => stringifyBlockNoteDocumentForStorage([{ type: "paragraph" }])).toThrow(
      /missing or empty "id"/,
    );
  });
});

describe("insertBlocks", () => {
  it("inserts at start and end without touching the input", () => {
    const doc = sampleDoc();
    const snapshot = structuredClone(doc);

    const atStart = insertBlocks(doc, "start", undefined, [
      { type: "paragraph", content: [text("first")] },
    ]);
    expect(atStart.tree.map((b) => b.type)).toEqual(["paragraph", "heading", "paragraph"]);

    const atEnd = insertBlocks(doc, "end", undefined, [
      { type: "paragraph", content: [text("last")] },
    ]);
    expect(atEnd.tree[atEnd.tree.length - 1].content).toEqual([text("last")]);

    expect(doc).toEqual(snapshot);
  });

  it("inserts before and after a reference block, including nested ones", () => {
    const doc = sampleDoc();
    const before = insertBlocks(doc, "before", "p1", [{ type: "divider" }]);
    expect(before.tree.map((b) => b.type)).toEqual(["heading", "divider", "paragraph"]);

    const after = insertBlocks(doc, "after", "c1", [{ type: "divider" }]);
    expect(after.tree[1].children!.map((b) => b.type)).toEqual(["paragraph", "divider"]);
  });

  it("always assigns fresh ids, ignoring any the caller supplied", () => {
    const doc = sampleDoc();
    const result = insertBlocks(doc, "end", undefined, [
      { type: "paragraph", children: [{ type: "paragraph" }] } as never,
    ]);
    const inserted = result.tree[result.tree.length - 1];
    expect(result.insertedIds).toEqual([inserted.id]);
    expect(new Set(listBlockIds(result.tree)).size).toBe(listBlockIds(result.tree).length);
    expect(listBlockIds(result.tree)).toHaveLength(5);
  });

  it("throws when the reference block is unknown", () => {
    expect(() => insertBlocks(sampleDoc(), "after", "nope", [{ type: "divider" }])).toThrow(
      /Block id "nope" was not found/,
    );
  });

  it("throws when before/after is used without a reference block", () => {
    expect(() => insertBlocks(sampleDoc(), "before", undefined, [{ type: "divider" }])).toThrow(
      /missing referenceBlockId/,
    );
  });
});

describe("replaceBlock", () => {
  it("preserves the target id and reuses descendant ids from the old subtree", () => {
    const tree = replaceBlock(sampleDoc(), "p1", {
      type: "quote",
      content: [text("Replaced")],
      children: [{ id: "c1", type: "paragraph", content: [text("Kept id")] }],
    });

    expect(tree[1].id).toBe("p1");
    expect(tree[1].type).toBe("quote");
    expect(tree[1].children![0].id).toBe("c1");
  });

  it("gives fresh ids to descendants that did not belong to the subtree", () => {
    const tree = replaceBlock(sampleDoc(), "p1", {
      type: "paragraph",
      children: [
        { id: "h1", type: "paragraph" },
        { type: "paragraph" },
      ],
    });

    const childIds = tree[1].children!.map((c) => c.id);
    expect(childIds).not.toContain("h1");
    expect(new Set(listBlockIds(tree)).size).toBe(listBlockIds(tree).length);
  });

  it("does not emit duplicates when the same subtree id is claimed twice", () => {
    const tree = replaceBlock(sampleDoc(), "p1", {
      type: "paragraph",
      children: [
        { id: "c1", type: "paragraph" },
        { id: "c1", type: "paragraph" },
      ],
    });

    const ids = listBlockIds(tree);
    expect(new Set(ids).size).toBe(ids.length);
    expect(() => validateBlockNoteDocument(tree)).not.toThrow();
  });

  it("throws when the target does not exist", () => {
    expect(() => replaceBlock(sampleDoc(), "nope", { type: "paragraph" })).toThrow(
      /Block id "nope" was not found/,
    );
  });
});

describe("deleteBlocks", () => {
  it("removes a block and its subtree", () => {
    const { tree, missing } = deleteBlocks(sampleDoc(), ["p1"]);
    expect(missing).toEqual([]);
    expect(listBlockIds(tree)).toEqual(["h1"]);
  });

  it("removes a nested block without touching its parent", () => {
    const { tree } = deleteBlocks(sampleDoc(), ["c1"]);
    expect(listBlockIds(tree)).toEqual(["h1", "p1"]);
  });

  it("performs no deletion at all when one id is missing", () => {
    const doc = sampleDoc();
    const { tree, missing } = deleteBlocks(doc, ["h1", "nope"]);
    expect(missing).toEqual(["nope"]);
    expect(tree).toBe(doc);
  });
});

describe("updateBlockProps", () => {
  it("merges the patch onto existing props", () => {
    const tree = updateBlockProps(sampleDoc(), "h1", { level: 3, textColor: "blue" });
    expect(tree[0].props).toEqual({ level: 3, textColor: "blue" });
  });

  it("removes a key when the patch value is null", () => {
    const tree = updateBlockProps(sampleDoc(), "h1", { level: null });
    expect(tree[0].props).toEqual({});
  });

  it("does not mutate the input document", () => {
    const doc = sampleDoc();
    updateBlockProps(doc, "h1", { level: 6 });
    expect(doc[0].props).toEqual({ level: 1 });
  });

  it("throws for an unknown block", () => {
    expect(() => updateBlockProps(sampleDoc(), "nope", {})).toThrow(/was not found/);
  });
});

describe("patchBlockText", () => {
  it("replaces a substring inside a single text leaf", () => {
    const tree = patchBlockText(sampleDoc(), "p1", "world", "there");
    expect(extractInlineText(tree[1].content)).toBe("Hello there");
  });

  it("keeps the styles of the surrounding leaves when the match spans several", () => {
    const doc: BlockNoteBlock[] = [
      {
        id: "p1",
        type: "paragraph",
        content: [text("Hello "), text("world", { bold: true })],
      },
    ];
    const tree = patchBlockText(doc, "p1", "lo wo", "XX");
    const content = tree[0].content as Array<Record<string, unknown>>;

    expect(extractInlineText(content)).toBe("HelXXrld");
    expect(content[0]).toEqual(text("Hel"));
    expect(content[content.length - 1]).toEqual(text("rld", { bold: true }));
  });

  it("deletes the match when the replacement is empty", () => {
    const tree = patchBlockText(sampleDoc(), "p1", " world", "");
    expect(extractInlineText(tree[1].content)).toBe("Hello");
  });

  it("patches inside a link without dropping the href", () => {
    const doc: BlockNoteBlock[] = [
      {
        id: "p1",
        type: "paragraph",
        content: [
          text("see "),
          { type: "link", href: "https://example.com", content: [text("the docs")] },
        ],
      },
    ];
    const tree = patchBlockText(doc, "p1", "the docs", "the guide");
    const link = (tree[0].content as Array<Record<string, unknown>>)[1];

    expect(link.href).toBe("https://example.com");
    expect(extractInlineText(link.content)).toBe("the guide");
  });

  it("patches inside a table cell", () => {
    const doc: BlockNoteBlock[] = [
      {
        id: "t1",
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            { cells: [{ type: "tableCell", props: {}, content: [text("before")] }] },
          ],
        },
      },
    ];
    const tree = patchBlockText(doc, "t1", "before", "after");
    expect(extractInlineText(tree[0].content)).toBe("after");
  });

  it("refuses an ambiguous match and leaves the document untouched", () => {
    const doc: BlockNoteBlock[] = [paragraph("p1", "aa bb aa")];
    expect(() => patchBlockText(doc, "p1", "aa", "cc")).toThrow(/Found 2 matches/);
    expect(extractInlineText(doc[0].content)).toBe("aa bb aa");
  });

  it("refuses a match that is not present", () => {
    expect(() => patchBlockText(sampleDoc(), "p1", "absent", "x")).toThrow(
      /No match found/,
    );
  });

  it("only looks inside the target block", () => {
    const doc = [paragraph("p1", "shared"), paragraph("p2", "shared")];
    const tree = patchBlockText(doc, "p2", "shared", "changed");
    expect(extractInlineText(tree[0].content)).toBe("shared");
    expect(extractInlineText(tree[1].content)).toBe("changed");
  });
});

describe("normalizeReplaceDocumentBlocks", () => {
  it("fills in missing ids and keeps supplied ones", () => {
    const blocks = normalizeReplaceDocumentBlocks([
      { id: "keep", type: "paragraph" },
      { type: "paragraph" },
    ]);
    expect(blocks[0].id).toBe("keep");
    expect(blocks[1].id).toBeTruthy();
    expect(blocks[1].id).not.toBe("keep");
  });

  it("rejects duplicate supplied ids", () => {
    expect(() =>
      normalizeReplaceDocumentBlocks([
        { id: "dup", type: "paragraph" },
        { id: "dup", type: "paragraph" },
      ]),
    ).toThrow(/Duplicate block id "dup"/);
  });
});

describe("extractInlineText", () => {
  it("handles strings, leaves, links and nested content", () => {
    expect(extractInlineText("raw")).toBe("raw");
    expect(
      extractInlineText([
        text("a "),
        { type: "link", href: "#", content: [text("b")] },
        "c",
      ]),
    ).toBe("a bc");
  });

  it("contributes nothing for custom inline nodes such as date pills", () => {
    expect(extractInlineText([text("on "), { type: "date", props: { date: "x" } }])).toBe(
      "on ",
    );
  });

  it("joins table cells with a space", () => {
    expect(
      extractInlineText({
        type: "tableContent",
        rows: [
          {
            cells: [
              { type: "tableCell", props: {}, content: [text("a")] },
              { type: "tableCell", props: {}, content: [text("b")] },
            ],
          },
        ],
      }),
    ).toBe("a b");
  });
});

describe("blockNoteDocumentHasText", () => {
  it("is false for an empty document or blank paragraphs", () => {
    expect(blockNoteDocumentHasText([])).toBe(false);
    expect(blockNoteDocumentHasText([{ id: "p", type: "paragraph", content: [] }])).toBe(
      false,
    );
    expect(
      blockNoteDocumentHasText([{ id: "p", type: "paragraph", content: [text("   ")] }]),
    ).toBe(false);
  });

  it("is true for visible text, including deep inside children", () => {
    expect(blockNoteDocumentHasText(sampleDoc())).toBe(true);
    expect(
      blockNoteDocumentHasText([
        { id: "p", type: "paragraph", content: [], children: [paragraph("c", "deep")] },
      ]),
    ).toBe(true);
  });

  it("is true for a date pill even though it carries no text", () => {
    expect(
      blockNoteDocumentHasText([
        { id: "p", type: "paragraph", content: [{ type: "date", props: { date: "x" } }] },
      ]),
    ).toBe(true);
  });

  it("is true for non-textual blocks such as images and dividers", () => {
    expect(blockNoteDocumentHasText([{ id: "i", type: "image", props: { url: "u" } }])).toBe(
      true,
    );
    expect(blockNoteDocumentHasText([{ id: "d", type: "divider" }])).toBe(true);
  });
});
