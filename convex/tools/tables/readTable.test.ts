/// <reference types="vite/client" />
import { createRequire } from "node:module";
import { convexTest } from "convex-test";
import { beforeAll, describe, expect, test } from "vitest";
import { internal } from "../../_generated/api";
import { attachToolCtx } from "../../ia/tools/toolHelpers";
import schema from "../../schema";
import { modules } from "../../test.setup";
import type { ToolRunCtx } from "../runtime";
import { canvasScope } from "../scope";
import bashTool from "../shell/bash.agent";
import { readTable } from "./readTable";

// just-bash est chargé par `globalThis.require` (cf. shell/shell.ts).
beforeAll(() => {
  (globalThis as { require?: unknown }).require = createRequire(
    import.meta.url,
  );
});

const richText = (text: string) => [
  {
    id: "b",
    type: "paragraph",
    props: {},
    content: [{ type: "text", text, styles: {} }],
    children: [],
  },
];

/** Une table avec les 8 types de colonnes, et un lien qui n'est pas une table. */
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
    return { userId, canvasId };
  });

  const create = async (type: "table" | "link", values: Record<string, unknown>) => {
    const [created] = await t.mutation(
      internal.wrappers.nodeWrappers.createWithNodeData,
      {
        nodes: [
          {
            node: { canvasId, type, position: { x: 0, y: 0 }, width: 100, height: 100 },
            nodeDataValues: values,
          },
        ],
      },
    );
    return created.nodeId;
  };

  const linkId = await create("link", {
    link: { href: "https://doc.test", pageTitle: "Spec doc" },
  });
  const tableId = await create("table", {
    table: {
      columns: [
        { id: "c_name", name: "Name", type: "text" },
        { id: "c_amount", name: "Amount", type: "number" },
        {
          id: "c_status",
          name: "Status",
          type: "select",
          options: [
            { id: "o_open", label: "Open", color: "green" },
            { id: "o_done", label: "Done", color: "gray" },
          ],
        },
        {
          id: "c_tags",
          name: "Tags",
          type: "select",
          isMulti: true,
          options: [
            { id: "t_a", label: "urgent", color: "red" },
            { id: "t_b", label: "q3", color: "blue" },
          ],
        },
        { id: "c_done", name: "Paid", type: "checkbox" },
        { id: "c_due", name: "Due", type: "date" },
        { id: "c_url", name: "Link", type: "link" },
        { id: "c_ref", name: "Ref", type: "node" },
        { id: "c_notes", name: "Notes", type: "richtext" },
        { id: "c_dup", name: "Name", type: "text" },
      ],
      rows: [
        {
          id: "r1",
          cells: {
            c_name: "Rent",
            c_amount: 1200,
            c_status: "o_open",
            c_tags: ["t_a", "t_b"],
            c_done: true,
            c_due: "2026-11-01",
            c_url: { href: "https://rent.test", pageTitle: "" },
            c_ref: { nodeId: linkId },
            c_notes: richText("Paid by\ntransfer"),
            c_dup: "x",
          },
        },
        { id: "r2", cells: { c_name: "Food", c_amount: 300, c_status: "o_done" } },
        { id: "r3", cells: { c_name: "Gym", c_amount: 45.5, c_status: "o_open" } },
      ],
    },
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
    tableId,
    linkId,
    read: (nodeId: string) =>
      readTable(runCtx, canvasScope({ userId, canvasId }), nodeId),
    bash: async (script: string) =>
      (await tool.execute!({ explanation: "test", script } as never, {
        toolCallId: "call",
        messages: [],
      })) as string,
  };
}

const stdout = (output: string) =>
  /<stdout>\n([\s\S]*?)\n<\/stdout>/.exec(output)?.[1] ?? "";

describe("readTable", () => {
  test("des valeurs lisibles pour chaque type de colonne", async () => {
    const { read, tableId, linkId } = await setup();
    const result = await read(tableId);
    if (!result.ok) throw new Error(result.error);
    expect(result.table.rows[0]).toEqual({
      id: "r1",
      cells: {
        c_name: "Rent",
        c_amount: 1200,
        c_status: ["Open"],
        c_tags: ["urgent", "q3"],
        c_done: true,
        c_due: "2026-11-01",
        c_url: { href: "https://rent.test", title: null },
        c_ref: { nodeId: linkId, title: "Spec doc" },
        c_notes: "Paid by\ntransfer",
        c_dup: "x",
      },
    });
    expect(result.table.rows[1].cells.c_tags).toBeNull();
  });

  test("un node qui n'est pas une table, ou qui n'existe pas", async () => {
    const { read, linkId } = await setup();
    expect(await read(linkId)).toEqual({
      ok: false,
      error: `node "${linkId}" is a link, not a table`,
    });
    expect(await read("nope")).toEqual({
      ok: false,
      error: 'node "nope" not found',
    });
  });
});

describe("nole table", () => {
  test("TSV avec en-tête, toutes les lignes", async () => {
    const { bash, tableId } = await setup();
    const lines = stdout(await bash(`nole table ${tableId}`)).split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[0].split("\t")).toEqual([
      "rowId",
      "Name (c_name)",
      "Amount",
      "Status",
      "Tags",
      "Paid",
      "Due",
      "Link",
      "Ref",
      "Notes",
      "Name (c_dup)",
    ]);
    expect(lines[1].split("\t")).toEqual([
      "r1",
      "Rent",
      "1200",
      "Open",
      "urgent; q3",
      "true",
      "2026-11-01",
      "https://rent.test",
      "Spec doc",
      "Paid by transfer",
      "x",
    ]);
  });

  test("awk somme une colonne, jq groupe", async () => {
    const { bash, tableId } = await setup();
    expect(
      stdout(
        await bash(
          `nole table ${tableId} --columns Amount | awk 'NR > 1 { s += $2 } END { print s }'`,
        ),
      ),
    ).toBe("1545.5");
    const grouped = JSON.parse(
      stdout(
        await bash(
          `nole table ${tableId} --format jsonl | jq -c -s 'group_by(.Status) | map({(.[0].Status): length}) | add'`,
        ),
      ),
    );
    expect(grouped).toEqual({ Open: 2, Done: 1 });
  });

  test("jsonl : select simple en chaîne, multiple en tableau", async () => {
    const { bash, tableId, linkId } = await setup();
    const first = JSON.parse(
      stdout(await bash(`nole table ${tableId} --format jsonl | head -1`)),
    );
    expect(first).toMatchObject({
      rowId: "r1",
      Status: "Open",
      Tags: ["urgent", "q3"],
      Ref: { nodeId: linkId, title: "Spec doc" },
    });
  });

  test("--schema, et les erreurs", async () => {
    const { bash, tableId, linkId } = await setup();
    expect(stdout(await bash(`nole table ${tableId} --schema | grep Tags`))).toBe(
      "c_tags\tTags\tselect (multi)\turgent; q3",
    );
    const notTable = await bash(`nole table ${linkId}`);
    expect(notTable).toContain("is a link, not a table");
    expect(notTable).toContain("<exitCode>1</exitCode>");
    expect(await bash(`nole table ${tableId} --columns Nope`)).toContain(
      'no column "Nope"',
    );
  });
});
