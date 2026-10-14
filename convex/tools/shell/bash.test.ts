import { beforeAll, describe, expect, test } from "vitest";
import {
  blocknoteDoc,
  createNode,
  enableRequire,
  setupTools,
  stdout,
} from "../testing.helpers";
import { MAX_OUTPUT_CHARS, renderShellResult } from "./bash.agent";
import { parseArgs } from "./cli";

beforeAll(enableRequire);

/** Quatre notes, dont trois parlent de budget, et un lien. */
async function setup() {
  const tools = await setupTools();
  const notes = [
    ["Budget Q3", "The marketing budget is 40k."],
    ["Roadmap", "Ship the CLI before the budget review."],
    ["Team", "Five people, no budget line."],
    ["Ideas", "A canvas as a filesystem."],
  ];
  const ids: string[] = [];
  for (const [index, [title, body]] of notes.entries()) {
    const node = await createNode(tools, {
      type: "blocknote",
      x: index * 300,
      values: { doc: blocknoteDoc(title, body) },
    });
    ids.push(node.id);
  }
  const link = await createNode(tools, {
    type: "link",
    y: 500,
    values: { link: { href: "https://example.com" } },
  });
  return { bash: tools.bash, ids, linkId: link.id };
}

describe("bash", () => {
  test("nole ls : une ligne TSV par node, sans plafond", async () => {
    const { bash, ids, linkId } = await setup();
    const lines = stdout(await bash("nole ls")).split("\n");
    expect(lines).toHaveLength(5);
    const fields = lines
      .map((line) => line.split("\t"))
      .find(([id]) => id === ids[0])!;
    expect(fields.slice(0, 7)).toEqual([
      ids[0],
      "blocknote",
      "Budget Q3",
      "0",
      "0",
      "",
      "",
    ]);
    // updatedAt : date ISO du dernier changement de contenu.
    expect(fields[7]).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
    expect(lines.some((line) => line.startsWith(`${linkId}\tlink\t`))).toBe(
      true,
    );
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
        `nole ls --format ids | nole read --format jsonl - | jq -r 'select(.content | test("Five people")) | .title'`,
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

  test("nole read lit une fois un node reçu plusieurs fois", async () => {
    const { bash, ids } = await setup();
    const output = stdout(
      await bash(`printf '${ids[0]}\\n${ids[0]}\\n' | nole read --format jsonl -`),
    );
    expect(output.split("\n")).toHaveLength(1);
  });

  test("nole ls refuse un type inconnu", async () => {
    const { bash } = await setup();
    const output = await bash("nole ls --type nope");
    expect(output).toContain('nole ls: unknown type "nope"');
    expect(output).toContain("<exitCode>2</exitCode>");
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
