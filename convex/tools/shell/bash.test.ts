/// <reference types="vite/client" />
import { createRequire } from "node:module";
import { convexTest } from "convex-test";
import prosemirrorSyncTest from "@convex-dev/prosemirror-sync/test";
import { beforeAll, describe, expect, test } from "vitest";
import { internal } from "../../_generated/api";
import debouncerSchema from "../../components/debouncer/schema";
import { attachToolCtx } from "../../ia/tools/toolHelpers";
import schema from "../../schema";
import { modules } from "../../test.setup";
import bashTool, { MAX_OUTPUT_CHARS, renderShellResult } from "./bash.agent";
import { parseArgs } from "./cli";

// En production, just-bash et jsdom sont chargés par `globalThis.require`
// dans l'action Node qui exécute le tool (cf. shell.ts). Le runtime de test
// n'en a pas : on lui en donne un.
beforeAll(() => {
  (globalThis as { require?: unknown }).require = createRequire(
    import.meta.url,
  );
});

const doc = (title: string, body: string) =>
  JSON.stringify([
    {
      id: "h",
      type: "heading",
      props: { level: 1 },
      content: [{ type: "text", text: title, styles: {} }],
      children: [],
    },
    {
      id: "p",
      type: "paragraph",
      props: {},
      content: [{ type: "text", text: body, styles: {} }],
      children: [],
    },
  ]);

async function setup() {
  const t = convexTest(schema, modules);
  prosemirrorSyncTest.register(t);
  t.registerComponent(
    "debouncer",
    debouncerSchema,
    import.meta.glob("../../components/debouncer/**/*.ts"),
  );
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

  const ids: string[] = [];
  const notes = [
    ["Budget Q3", "The marketing budget is 40k."],
    ["Roadmap", "Ship the CLI before the budget review."],
    ["Team", "Five people, no budget line."],
    ["Ideas", "A canvas as a filesystem."],
  ];
  for (const [index, [title, body]] of notes.entries()) {
    const [created] = await t.mutation(
      internal.wrappers.nodeWrappers.createWithNodeData,
      {
        nodes: [
          {
            node: {
              canvasId,
              type: "blocknote",
              position: { x: index * 300, y: 0 },
              width: 200,
              height: 100,
            },
            nodeDataValues: { doc: doc(title, body) },
          },
        ],
      },
    );
    ids.push(created.nodeId);
  }
  const [link] = await t.mutation(
    internal.wrappers.nodeWrappers.createWithNodeData,
    {
      nodes: [
        {
          node: {
            canvasId,
            type: "link",
            position: { x: 0, y: 500 },
            width: 200,
            height: 100,
          },
          nodeDataValues: { link: { href: "https://example.com" } },
        },
      ],
    },
  );

  const runCtx = {
    runQuery: t.query,
    runMutation: t.mutation,
    runAction: t.action,
  } as never;
  const tool = attachToolCtx(
    bashTool({ threadCtx: { authUserId: userId, canvasId } }),
    runCtx,
  );
  const bash = async (script: string) =>
    (await tool.execute!({ explanation: "test", script } as never, {
      toolCallId: "call",
      messages: [],
    })) as string;

  return { bash, ids, linkId: link.nodeId };
}

/** Le stdout d'une sortie rendue. */
function stdout(output: string): string {
  return /<stdout>\n([\s\S]*?)\n<\/stdout>/.exec(output)?.[1] ?? "";
}

describe("bash", () => {
  test("nole ls : une ligne TSV par node, sans plafond", async () => {
    const { bash, ids, linkId } = await setup();
    const lines = stdout(await bash("nole ls")).split("\n");
    expect(lines).toHaveLength(5);
    expect(lines[0].split("\t")).toEqual([
      ids[0],
      "blocknote",
      "Budget Q3",
      "0",
      "0",
      "",
      "",
    ]);
    expect(lines[4].split("\t").slice(0, 3)).toEqual([
      linkId,
      "link",
      "https://example.com",
    ]);
  });

  test("pipes : ls | read - | grep, avec les outils Unix", async () => {
    const { bash } = await setup();
    const output = await bash(
      "nole ls --type blocknote --format ids | nole read - | grep -c -i budget",
    );
    // Titre « Budget Q3 » (heading et attribut title) + trois paragraphes.
    expect(Number(stdout(output))).toBeGreaterThanOrEqual(3);
  });

  test("jq sur le format jsonl", async () => {
    const { bash, ids } = await setup();
    const output = await bash(
      `nole ls --format jsonl | jq -r 'select(.title | test("road"; "i")) | .id'`,
    );
    expect(stdout(output)).toBe(ids[1]);
  });

  test("nole read rend le XML de read_nodes", async () => {
    const { bash, ids } = await setup();
    const output = stdout(await bash(`nole read ${ids[2]}`));
    expect(output).toContain(`<node id="${ids[2]}" type="blocknote"`);
    expect(output).toContain("Five people, no budget line.");
    // Le schéma d'écriture n'est rendu que sur demande.
    expect(output).not.toContain("<nodeDataSchemas>");
    expect(stdout(await bash(`nole read --schemas ${ids[2]}`))).toContain(
      "<nodeDataSchemas>",
    );
  });

  test("nole read --format jsonl, pour jq", async () => {
    const { bash, ids } = await setup();
    const output = stdout(
      await bash(
        `nole ls --format ids | nole read --format jsonl - | jq -r 'select(.xml | test("Five people")) | .title'`,
      ),
    );
    expect(output).toBe("Team");
    const line = JSON.parse(stdout(await bash(`nole read --format jsonl ${ids[0]}`)));
    expect(line).toMatchObject({ id: ids[0], type: "blocknote", title: "Budget Q3", ok: true, error: null });
  });

  test("un échec se voit dans le code de sortie", async () => {
    const { bash, ids } = await setup();
    const read = await bash(`nole read ${ids[0]} missing`);
    expect(read).toContain("Budget Q3");
    expect(read).toContain("nole read: missing: not found");
    expect(read).toContain("<exitCode>1</exitCode>");
    expect(await bash("nole ls --frame nope")).toContain(
      'nole ls: Frame "nope" not found on canvas',
    );
    expect(await bash("nole read missing || echo fallback")).toContain("fallback");
  });

  test("un shell neuf par appel", async () => {
    const { bash } = await setup();
    await bash("echo kept > /tmp/state.txt");
    const output = await bash("cat /tmp/state.txt");
    expect(output).toContain("<exitCode>1</exitCode>");
  });

  test("les erreurs d'usage remontent sur stderr, avec un code", async () => {
    const { bash } = await setup();
    const output = await bash("nole ls --colour red");
    expect(output).toContain("nole ls: unknown option --colour");
    expect(output).toContain("<exitCode>2</exitCode>");
    expect(await bash("nole frobnicate")).toContain(
      'nole: unknown command "frobnicate"',
    );
  });

  test("pas de réseau", async () => {
    const { bash } = await setup();
    expect(await bash("curl https://example.com")).toContain("<exitCode>");
  });
});

describe("renderShellResult", () => {
  test("coupe au-delà du budget, et le dit", () => {
    const output = renderShellResult({
      stdout: "x".repeat(MAX_OUTPUT_CHARS + 500),
      stderr: "",
      exitCode: 0,
    });
    expect(output).toContain("[… 500 more characters cut.");
  });
});

describe("parseArgs", () => {
  test("options, flags, positionnels et stdin", () => {
    expect(
      parseArgs(["--type", "a", "--type=b", "--no-position", "-", "X1"], {
        options: ["type"],
        flags: ["no-position"],
      }),
    ).toEqual({
      options: new Map([["type", ["a", "b"]]]),
      flags: new Set(["no-position"]),
      positionals: ["-", "X1"],
    });
  });

  test("une option inconnue est une erreur", () => {
    expect(parseArgs(["--nope"], {})).toEqual({
      error: "unknown option --nope",
    });
  });
});
