import { describe, expect, test } from "vitest";
import { setupTools } from "../testing.helpers";
import { readNodes } from "./readNodes";
import { renderReadNodes } from "./readNodes.xml";

/** Un PDF indexé et une image indexée, insérés directement. */
async function setup() {
  const { t, canvasId, scope, run } = await setupTools();
  await t.run(async (ctx) => {
    const add = async (
      id: string,
      type: "pdf" | "image",
      values: Record<string, unknown>,
      chunk: Record<string, unknown>,
    ) => {
      const nodeDataId = await ctx.db.insert("nodeDatas", {
        canvasId,
        type,
        updatedAt: 0,
        values,
      });
      await ctx.db.insert("nodes", {
        id,
        nodeDataId,
        canvasId,
        type,
        position: { x: 0, y: 0 },
        width: 10,
        height: 10,
      });
      await ctx.db.insert("searchableChunks", {
        nodeDataId,
        canvasId,
        nodeType: type,
        title: id,
        order: 0,
        ...chunk,
      } as never);
    };
    await add(
      "P1",
      "pdf",
      { files: [{ url: "https://f.test/a.pdf", filename: "a.pdf" }] },
      {
        chunkType: "page",
        text: "# Intro\nHello",
        metadata: {
          page: 1,
          totalPages: 1,
          sections: [{ level: "h1", title: "Intro" }],
        },
      },
    );
    await add(
      "I1",
      "image",
      { images: [{ url: "https://img.test/a.png", filename: "a.png" }] },
      { chunkType: "node", text: "A cat" },
    );
  });
  return (nodeIds: string[], isMultimodal: boolean) =>
    readNodes(run, scope, nodeIds).then(
      (result) => renderReadNodes(result, { withPosition: true, isMultimodal }),
    );
}

describe("hints de nole read", () => {
  test("le PDF renvoie à nole read --pages", async () => {
    const render = await setup();
    const { text } = await render(["P1"], false);
    expect(text).toContain(
      "<pdfHint>Read the full markdown of specific pages with: nole read --pages 3,4 &lt;nodeId&gt;.</pdfHint>",
    );
    expect(text).not.toContain("read_nodes");
  });

  test("l'image renvoie à view_image, seulement pour un modèle qui lit les images", async () => {
    const render = await setup();
    expect((await render(["I1"], true)).text).toContain(
      "Call view_image to see the pixels",
    );
    expect((await render(["I1"], false)).text).not.toContain("view_image");
  });
});
