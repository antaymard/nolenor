/// <reference types="vite/client" />
import { createRequire } from "node:module";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { attachToolCtx } from "../../ia/tools/toolHelpers";
import schema from "../../schema";
import { modules } from "../../test.setup";
import type { ToolRunCtx } from "../runtime";
import { canvasScope, type ToolScope } from "../scope";
import bashTool from "../shell/bash.agent";
import { groupByNode, searchCanvas } from "./searchCanvas";

// just-bash est chargé par `globalThis.require` (cf. shell/shell.ts).
beforeAll(() => {
  (globalThis as { require?: unknown }).require = createRequire(
    import.meta.url,
  );
});

/**
 * Des nodes et leurs chunks, insérés directement : l'indexation réelle tourne
 * en tâche de fond, et la recherche plein texte de convex-test exige un titre
 * sur chaque chunk.
 */
async function setup() {
  const t = convexTest(schema, modules);
  const { userId, canvasId } = await t.run(async (ctx) => {
    const userId = await ctx.db.insert("users", {});
    const canvasId = await ctx.db.insert("canvases", {
      creatorId: userId,
      name: "Canvas",
      updatedAt: Date.now(),
      isPublic: false,
    });
    const nodes = [
      ["N1", "blocknote", "Budget Q3", ["The marketing budget is 40k.", "Budget cuts and hiring."]],
      ["N2", "blocknote", "Roadmap", ["Ship the CLI before the budget review."]],
      ["N3", "pdf", "Report.pdf", ["Annual budget overview.", "Risks and mitigation."]],
      ["N5", "pdf", "Attention.pdf", ["Attention is all you need.", "We use scaled dot-product\nattention here.", "Attention heads, scaled up."]],
      ["N4", "blocknote", "Ideas", ["A canvas as a filesystem."]],
    ] as const;
    for (const [id, type, title, chunks] of nodes) {
      const nodeDataId = await ctx.db.insert("nodeDatas", {
        canvasId,
        type,
        updatedAt: 0,
        values: {},
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
      for (const [order, text] of chunks.entries()) {
        await ctx.db.insert("searchableChunks", {
          nodeDataId,
          canvasId,
          chunkType: type === "pdf" ? "page" : "node",
          nodeType: type,
          title,
          text,
          order,
          ...(type === "pdf" && {
            metadata: { page: order + 1, totalPages: 2, sections: [] },
          }),
        });
      }
    }
    return { userId, canvasId };
  });

  const runCtx = {
    runQuery: t.query,
    runMutation: t.mutation,
    runAction: t.action,
  } as unknown as ToolRunCtx;
  const tool = attachToolCtx(
    bashTool({ threadCtx: { authUserId: userId, canvasId } }),
    runCtx as never,
  );
  return {
    scope: canvasScope({ userId, canvasId }),
    search: (scope: ToolScope, keyword: string) =>
      searchCanvas(runCtx, scope, { keyword, limit: 20 }),
    bash: async (script: string) =>
      (await tool.execute!({ explanation: "test", script } as never, {
        toolCallId: "call",
        messages: [],
      })) as string,
  };
}

const stdout = (output: string) =>
  /<stdout>\n([\s\S]*?)\n<\/stdout>/.exec(output)?.[1] ?? "";

describe("searchCanvas", () => {
  test("extraits centrés sur le terme, regroupés par node", async () => {
    const { search, scope } = await setup();
    const result = await search(scope, "budget");
    expect(result.mode).toBe("keyword");
    expect(new Set(result.hits.map((hit) => hit.nodeId))).toEqual(
      new Set(["N1", "N2", "N3"]),
    );
    const groups = groupByNode(result.hits);
    expect(groups.find((group) => group.nodeId === "N1")?.hitCount).toBe(2);
  });

  test("le scope de lecture borne la recherche", async () => {
    const { search, scope } = await setup();
    const result = await search({ ...scope, read: ["N2", "N4"] }, "budget");
    expect(result.hits.map((hit) => hit.nodeId)).toEqual(["N2"]);
    const empty = await search({ ...scope, read: [] }, "budget");
    expect(empty.hits).toEqual([]);
  });
});

describe("nole search", () => {
  test("une ligne TSV par extrait, la page d'un PDF", async () => {
    const { bash } = await setup();
    const lines = stdout(await bash("nole search budget --type pdf")).split("\n");
    expect(lines).toHaveLength(1);
    const [nodeId, type, chunkType, , where, title, snippet] =
      lines[0].split("\t");
    expect([nodeId, type, chunkType, where, title, snippet]).toEqual([
      "N3",
      "pdf",
      "page",
      "p1",
      "Report.pdf",
      "Annual budget overview.",
    ]);
  });

  test("une phrase exacte ne rend que les pages qui la portent", async () => {
    const { bash } = await setup();
    const output = stdout(
      await bash(`nole search '"scaled dot-product attention"' --type pdf`),
    );
    expect(output.split("\n").map((line) => line.split("\t")[4])).toEqual([
      "p2",
    ]);
  });

  test("la note de troncature dit vrai", async () => {
    const { bash } = await setup();
    // 4 extraits contiennent « budget » : coupé à 2, il en reste.
    expect(await bash("nole search budget --limit 2")).toContain(
      "note: more results exist",
    );
    // Juste assez : pas de note.
    expect(await bash("nole search budget --limit 4")).not.toContain(
      "more results exist",
    );
  });

  test("jsonl : sources ; --by-node --snippets", async () => {
    const { bash } = await setup();
    const hit = JSON.parse(
      stdout(await bash("nole search budget --format jsonl --limit 1")),
    );
    expect(hit.sources).toEqual(["keyword"]);
    const byNode = stdout(
      await bash("nole search budget --by-node --snippets 2 | grep '^N1'"),
    );
    expect(byNode).toContain("The marketing budget is 40k. … Budget cuts and hiring.");
    expect(await bash("nole search budget --snippets 2")).toContain(
      "--snippets goes with --by-node",
    );
  });

  test("--by-node, --format ids, --in depuis stdin", async () => {
    const { bash } = await setup();
    const byNode = stdout(await bash("nole search budget --by-node"));
    expect(byNode.split("\n")).toHaveLength(3);
    expect(byNode).toMatch(/^N1\tblocknote\t2\t/m);

    const ids = stdout(await bash("nole search budget --format ids | sort"));
    expect(ids).toBe("N1\nN2\nN3");

    const within = stdout(
      await bash("printf 'N2\\nN4\\n' | nole search --in - budget --format ids"),
    );
    expect(within).toBe("N2");
  });

  test("code 1 sans résultat, 2 sur une erreur d'usage", async () => {
    const { bash } = await setup();
    const none = await bash("nole search zzzunknown");
    expect(none).toContain("<exitCode>1</exitCode>");
    expect(none).toContain("nole search: no match; try spelling variants");
    const badType = await bash("nole search budget --type nope");
    expect(badType).toContain('unknown type "nope"');
    expect(badType).toContain("<exitCode>2</exitCode>");
  });
});
