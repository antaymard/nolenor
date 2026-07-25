// @vitest-environment jsdom
//
// Contract test for the assumption `BlockNoteStatic` relies on: block types it
// does not map natively (toggle, table, media, columns…) fall back to
// `blocksToFullHTML`, which serializes the block WITH its nested children.
// `renderBlock` therefore reports `childrenIncluded: true` for that path and
// `renderBlocks` skips its own children wrapper — otherwise nested content
// would be rendered twice on the canvas preview.
//
// If a BlockNote upgrade ever stops emitting children here, this test fails and
// the `childrenIncluded` flag in BlockNoteStatic.tsx must be revisited.

import { describe, expect, it } from "vitest";

describe("blocksToFullHTML fallback contract", () => {
  it("serializes nested children along with the block", async () => {
    const { BlockNoteEditor } = await import("@blocknote/core");
    const editor = BlockNoteEditor.create();

    const html = editor.blocksToFullHTML([
      {
        id: "parent",
        type: "toggleListItem",
        content: [{ type: "text", text: "PARENT", styles: {} }],
        children: [
          {
            id: "child",
            type: "paragraph",
            content: [{ type: "text", text: "CHILD", styles: {} }],
          },
        ],
      },
    ] as never);

    expect(html).toContain("PARENT");
    expect(html).toContain("CHILD");
  });
});
