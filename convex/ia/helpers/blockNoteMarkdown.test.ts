// Round-trip tests for the BlockNote XML v1 codec.
//
// These drive the real production path: `withHeadlessEditor` boots jsdom via
// `globalThis.require` (as it does inside a Convex "use node" action) and loads
// `@blocknote/core` through a dynamic import. Supplying `require` below is the
// only shim needed — everything else is the code that actually ships.

import { createRequire } from "node:module";
import { beforeAll, describe, expect, it } from "vitest";

import type { BlockNoteBlock } from "../../lib/blockNoteDocument";

type Codec = typeof import("./blockNoteMarkdown");
let codec: Codec;

beforeAll(async () => {
  (globalThis as { require?: unknown }).require ??= createRequire(import.meta.url);
  codec = await import("./blockNoteMarkdown");
});

// ── Fixtures ────────────────────────────────────────────────────────────────

function text(value: string, styles: Record<string, unknown> = {}) {
  return { type: "text", text: value, styles };
}

function cell(value: string, props: Record<string, unknown> = {}) {
  return {
    type: "tableCell",
    props: {
      backgroundColor: "default",
      textColor: "default",
      textAlignment: "left",
      colspan: 1,
      rowspan: 1,
      ...props,
    },
    content: [text(value)],
  };
}

/** blocks → XML → blocks, the cycle `read_nodes` + `replace_block` perform. */
async function roundTrip(blocks: BlockNoteBlock[]) {
  const xml = await codec.blockNoteDocumentToXml(blocks);
  return { xml, blocks: await codec.parseBlockNoteXml(xml) };
}

describe("blockNoteDocumentToXml", () => {
  it("emits a self-closing root for an empty document", async () => {
    expect(await codec.blockNoteDocumentToXml([])).toBe('<blocknote version="1"/>');
  });

  it("emits id, type and only the non-default props", async () => {
    const xml = await codec.blockNoteDocumentToXml([
      {
        id: "h1",
        type: "heading",
        // `textAlignment: "left"` is the frozen default and must be omitted.
        props: { level: 2, textAlignment: "left" },
        content: [text("Titre")],
      },
    ]);
    expect(xml).toContain('<block id="h1" type="heading"');
    expect(xml).toContain("&quot;level&quot;:2");
    expect(xml).not.toContain("textAlignment");
  });

  it("emits a self-closing block when there is no content and no children", async () => {
    const xml = await codec.blockNoteDocumentToXml([{ id: "d1", type: "divider" }]);
    expect(xml).toContain('<block id="d1" type="divider"/>');
  });
});

describe("XML round-trip", () => {
  it("preserves ids, types, props and inline markdown", async () => {
    const input: BlockNoteBlock[] = [
      { id: "h1", type: "heading", props: { level: 2 }, content: [text("Titre")] },
      {
        id: "p1",
        type: "paragraph",
        props: { textColor: "blue" },
        content: [text("gras", { bold: true })],
      },
    ];
    const { blocks } = await roundTrip(input);

    expect(blocks.map((b) => [b.id, b.type])).toEqual([
      ["h1", "heading"],
      ["p1", "paragraph"],
    ]);
    expect(blocks[0].props).toEqual({ level: 2 });
    expect(blocks[1].props).toEqual({ textColor: "blue" });
    expect(blocks[1].content).toEqual([text("gras", { bold: true })]);
  });

  it("preserves nested children", async () => {
    const { blocks } = await roundTrip([
      {
        id: "l1",
        type: "bulletListItem",
        content: [text("parent")],
        children: [{ id: "l2", type: "bulletListItem", content: [text("enfant")] }],
      },
    ]);

    expect(blocks[0].children).toHaveLength(1);
    expect(blocks[0].children![0].id).toBe("l2");
    expect(blocks[0].children![0].content).toEqual([text("enfant")]);
  });

  it("preserves links, including query strings with ampersands", async () => {
    const href = "https://example.test/x?a=1&b=2";
    const { blocks } = await roundTrip([
      {
        id: "p1",
        type: "paragraph",
        content: [{ type: "link", href, content: [text("lien")] }],
      },
    ]);

    const inline = blocks[0].content as Array<Record<string, unknown>>;
    const link = inline[inline.length - 1];
    expect(link.type).toBe("link");
    expect(link.href).toBe(href);
  });

  it("escapes and restores XML-significant characters in text", async () => {
    const { blocks } = await roundTrip([
      { id: "p1", type: "paragraph", content: [text('a & b < c > d " e')] },
    ]);
    expect((blocks[0].content as Array<{ text: string }>)[0].text).toBe(
      'a & b < c > d " e',
    );
  });

  it("round-trips callouts losslessly, icon and color included", async () => {
    const { blocks } = await roundTrip([
      {
        id: "c1",
        type: "callout",
        props: { color: "yellow", icon: "⚠️" },
        content: [text("Attention")],
      },
    ]);

    expect(blocks[0].type).toBe("callout");
    expect(blocks[0].props).toEqual({ color: "yellow", icon: "⚠️" });
    expect(blocks[0].content).toEqual([text("Attention")]);
  });

  it("preserves table structure: header rows, widths, cell props and spans", async () => {
    const { blocks } = await roundTrip([
      {
        id: "t1",
        type: "table",
        content: {
          type: "tableContent",
          headerRows: 1,
          columnWidths: [120, undefined],
          rows: [{ cells: [cell("A"), cell("B", { backgroundColor: "red", colspan: 2 })] }],
        },
      },
    ]);

    const content = blocks[0].content as {
      headerRows?: number;
      columnWidths?: (number | null)[];
      rows: Array<{ cells: Array<{ props: Record<string, unknown>; content: unknown }> }>;
    };
    expect(content.headerRows).toBe(1);
    expect(content.columnWidths?.[0]).toBe(120);
    expect(content.rows[0].cells).toHaveLength(2);
    // Defaults are omitted from the XML and restored on the way back.
    expect(content.rows[0].cells[0].props).toEqual(cell("A").props);
    expect(content.rows[0].cells[1].props).toMatchObject({
      backgroundColor: "red",
      colspan: 2,
      rowspan: 1,
    });
  });

  it("round-trips date pills through the [[date:…]] token", async () => {
    const { xml, blocks } = await roundTrip([
      {
        id: "d1",
        type: "paragraph",
        content: [text("Le "), { type: "date", props: { date: "2026-07-24" } }, text(" ok")],
      },
    ]);

    expect(xml).toContain("[[date:2026-07-24]]");
    expect(blocks[0].content).toEqual([
      text("Le "),
      { type: "date", props: { date: "2026-07-24" } },
      text(" ok"),
    ]);
  });

  it("normalizes a legacy toDateString pill to ISO on the way out", async () => {
    const { xml, blocks } = await roundTrip([
      {
        id: "d1",
        type: "paragraph",
        content: [{ type: "date", props: { date: "Fri Jul 24 2026" } }],
      },
    ]);

    expect(xml).toContain("[[date:2026-07-24]]");
    expect(blocks[0].content).toEqual([{ type: "date", props: { date: "2026-07-24" } }]);
  });

  it("degrades an unparseable pill value to a readable label", async () => {
    const { xml, blocks } = await roundTrip([
      { id: "d1", type: "paragraph", content: [{ type: "date", props: { date: "???" } }] },
    ]);

    expect(xml).toContain("📅");
    expect(xml).not.toContain("[[date:");
    expect((blocks[0].content as Array<{ type: string }>)[0].type).toBe("text");
  });

  it("keeps surrounding styles when a pill sits between styled text", async () => {
    // Markdown emphasis cannot hug whitespace (`** apres**` is literal text),
    // so the codec moves the spaces out of the bold runs before serializing.
    // The visible text is unchanged and the words stay bold — only the span
    // boundaries shift. See `normalizeEmphasisWhitespace`.
    const { blocks } = await roundTrip([
      {
        id: "d1",
        type: "paragraph",
        content: [
          text("avant ", { bold: true }),
          { type: "date", props: { date: "2026-01-02" } },
          text(" apres", { bold: true }),
        ],
      },
    ]);

    expect(blocks[0].content).toEqual([
      text("avant", { bold: true }),
      text(" "),
      { type: "date", props: { date: "2026-01-02" } },
      text(" "),
      text("apres", { bold: true }),
    ]);
  });

  it("leaves a token inside a code span as literal text", async () => {
    const { blocks } = await roundTrip([
      {
        id: "d1",
        type: "paragraph",
        content: [text("[[date:2026-07-24]]", { code: true })],
      },
    ]);

    expect(blocks[0].content).toEqual([text("[[date:2026-07-24]]", { code: true })]);
  });

  it("keeps bold on a word directly wrapping a pill", async () => {
    const { blocks } = await roundTrip([
      {
        id: "d1",
        type: "paragraph",
        content: [
          text("Deadline:", { bold: true }),
          { type: "date", props: { date: "2026-01-02" } },
        ],
      },
    ]);

    expect(blocks[0].content).toEqual([
      text("Deadline:", { bold: true }),
      { type: "date", props: { date: "2026-01-02" } },
    ]);
  });

  it("round-trips a pill inside a table cell", async () => {
    const { blocks } = await roundTrip([
      {
        id: "t1",
        type: "table",
        content: {
          type: "tableContent",
          rows: [
            {
              cells: [
                {
                  ...cell("x"),
                  content: [{ type: "date", props: { date: "2026-03-09" } }],
                },
              ],
            },
          ],
        },
      },
    ]);

    const content = blocks[0].content as {
      rows: Array<{ cells: Array<{ content: unknown }> }>;
    };
    expect(content.rows[0].cells[0].content).toEqual([
      { type: "date", props: { date: "2026-03-09" } },
    ]);
  });
});

describe("parseBlockNoteXml", () => {
  it("rejects malformed XML", async () => {
    await expect(codec.parseBlockNoteXml("<blocknote>")).rejects.toThrow(
      /Invalid BlockNote XML/,
    );
  });

  it("rejects a wrong root element", async () => {
    await expect(codec.parseBlockNoteXml("<nope/>")).rejects.toThrow(
      /root element must be <blocknote>/,
    );
  });

  it("rejects an unknown version", async () => {
    await expect(codec.parseBlockNoteXml('<blocknote version="2"/>')).rejects.toThrow(
      /expected version="1"/,
    );
  });

  it("rejects unexpected elements", async () => {
    await expect(
      codec.parseBlockNoteXml('<blocknote version="1"><nope/></blocknote>'),
    ).rejects.toThrow(/unexpected element <nope>/);
  });

  it("rejects a block without a type", async () => {
    await expect(
      codec.parseBlockNoteXml('<blocknote version="1"><block id="a"/></blocknote>'),
    ).rejects.toThrow(/missing a "type" attribute/);
  });

  it("rejects invalid props JSON", async () => {
    await expect(
      codec.parseBlockNoteXml(
        '<blocknote version="1"><block type="paragraph" props="{oops}"/></blocknote>',
      ),
    ).rejects.toThrow(/invalid props JSON/);
  });

  it("rejects block content that would produce several blocks", async () => {
    await expect(
      codec.parseBlockNoteXml(
        '<blocknote version="1"><block type="paragraph">line one\n\nline two</block></blocknote>',
      ),
    ).rejects.toThrow(/produced 2 blocks/);
  });

  it("omits ids the XML does not carry, so the server can assign them", async () => {
    const blocks = await codec.parseBlockNoteXml(
      '<blocknote version="1"><block type="paragraph">hello</block></blocknote>',
    );
    expect(blocks[0].id).toBeUndefined();
    expect(blocks[0].type).toBe("paragraph");
  });
});

describe("markdownToBlockNoteBlocks", () => {
  it("returns an empty document for blank markdown", async () => {
    expect(await codec.markdownToBlockNoteBlocks("")).toEqual([]);
    expect(await codec.markdownToBlockNoteBlocks("   \n  ")).toEqual([]);
  });

  it("converts markdown headings and lists into blocks", async () => {
    const blocks = await codec.markdownToBlockNoteBlocks("# Titre\n\n- un\n- deux");
    expect(blocks[0].type).toBe("heading");
    expect(blocks.filter((b) => b.type === "bulletListItem")).toHaveLength(2);
  });

  it("turns [[date:…]] tokens into real pills", async () => {
    const blocks = await codec.markdownToBlockNoteBlocks("Rendez-vous [[date:2026-07-24]].");
    expect(blocks[0].content).toEqual([
      text("Rendez-vous "),
      { type: "date", props: { date: "2026-07-24" } },
      text("."),
    ]);
  });
});

describe("blocksToMarkdown", () => {
  it("renders callouts as plain text and date pills as a readable label", async () => {
    const markdown = await codec.blocksToMarkdown([
      { id: "c1", type: "callout", props: { color: "red", icon: "🔥" }, content: [text("Note")] },
      {
        id: "d1",
        type: "paragraph",
        content: [{ type: "date", props: { date: "Fri Jul 24 2026" } }],
      },
    ]);

    expect(markdown).toContain("Note");
    // Rewritten as a paragraph, so no blockquote marker leaks into the index.
    expect(markdown).not.toContain("> Note");
    // Legacy values are normalized, and the index gets the label, not the token.
    expect(markdown).toContain("📅 2026-07-24");
    expect(markdown).not.toContain("[[date:");
  });
});
