import {
  fail,
  idsFromStdin,
  ok,
  option,
  parseArgs,
  type CliCommand,
} from "../shell/cli";
import { readNodes } from "./readNodes";
import { renderReadNodes, type TableRowSliceInput } from "./readNodes.xml";

/**
 * Adaptateur CLI de `readNodes` : `nole read`. Même XML que le tool
 * `read_nodes` (retiré depuis) — un format que le modèle connaît, et dont il peut
 * renvoyer les blocs aux tools d'écriture —, mais avec des ids qui peuvent
 * venir d'un pipe, et une sortie que le shell filtre.
 */

/**
 * Le plafond d'un appel. Haut parce qu'avec `--format jsonl | jq` le filtre passe
 * avant la troncature de sortie ; borné parce que chaque node coûte une
 * conversion de document.
 */
const MAX_NODES_PER_CALL = 200;

const HELP = `Usage: nole read [options] <id>...
       <ids on stdin> | nole read [options] -

Read nodes as XML: documents as BlockNote XML (the write tools take its
blocks as-is), tables as Markdown, connections, frame contents, PDF tables of
contents, image descriptions (view_image shows the pixels), transcripts.
With "-", ids are read from stdin: the first field of each line, so the
output of "nole ls" can be piped directly.

Options:
  --pages <n,n…>        PDF nodes: read these 1-based pages instead of the
                        table of contents
  --rows <offset:limit> Table nodes: this slice of rows (default 0:50, max 200)
  --row-ids <id,id…>    Table nodes: these rows only
  --range <start:end>   Audio/video nodes: the transcript of this time range,
                        in seconds
  --no-position         Leave out x, y, width and height
  --format <fmt>        xml (default), or jsonl: one JSON object per node,
                        {id, type, title, ok, error, content}, for jq.
                        "content" holds the node's XML (document,
                        transcript, table…), as the default format prints it
  --schemas             Also print <nodeDataSchemas> (how to write each type
                        with the other tools)

Exit code 1 when a node cannot be read (unknown id): the others are still
printed, the failures are listed on stderr.

At most ${MAX_NODES_PER_CALL} nodes per call: filter first (nole ls … | grep … | nole read -).

Examples:
  nole read N12ab Q34cd
  nole ls --type blocknote | nole read - | grep -n "deadline"
  nole read --pages 3,4 P56ef
  nole ls --format ids | nole read --format jsonl - | jq -r 'select(.content | test("TODO")) | .id'`;

/** `a:b` → [a, b], deux nombres finis ≥ 0, ou null. */
function parsePair(value: string): [number, number] | null {
  const parts = value.split(":");
  if (parts.length !== 2) return null;
  const [a, b] = parts.map(Number);
  return Number.isFinite(a) && Number.isFinite(b) && a >= 0 && b >= 0
    ? [a, b]
    : null;
}

export const nodeReadCommand: CliCommand = {
  name: "read",
  summary: "read nodes as XML (ids as arguments or on stdin)",
  help: HELP,
  async run(args, { run, scope, stdin, multimodal }) {
    const parsed = parseArgs(args, {
      options: ["pages", "rows", "row-ids", "range", "format"],
      flags: ["no-position", "schemas"],
    });
    if ("error" in parsed) return fail(`nole read: ${parsed.error}`, 2);
    if (parsed.flags.has("help")) return ok(HELP);

    // Dédoublonnés : `nole search … | nole read -` donne un même node une
    // fois par extrait trouvé.
    const nodeIds = [
      ...new Set(
        parsed.positionals.flatMap((arg) =>
          arg === "-" ? idsFromStdin(stdin) : [arg],
        ),
      ),
    ];
    if (nodeIds.length === 0) {
      return fail(
        `nole read: no node id (pass ids, or "-" to read them from stdin)`,
        2,
      );
    }
    if (nodeIds.length > MAX_NODES_PER_CALL) {
      return fail(
        `nole read: ${nodeIds.length} nodes, at most ${MAX_NODES_PER_CALL} per call. Narrow the list first (grep, head).`,
        2,
      );
    }

    // Une option vaut pour tous les nodes du bon type : le modèle lit
    // rarement deux PDF à des pages différentes dans le même appel.
    let pages: number[] | undefined;
    const pagesOption = option(parsed, "pages");
    if (pagesOption) {
      pages = pagesOption.split(",").map(Number);
      if (pages.some((page) => !Number.isInteger(page) || page < 1)) {
        return fail(`nole read: --pages must be 1-based page numbers`, 2);
      }
    }

    let rowSlice: Omit<TableRowSliceInput, "nodeId"> | undefined;
    const rows = option(parsed, "rows");
    const rowIds = option(parsed, "row-ids");
    if (rowIds) {
      rowSlice = { rowIds: rowIds.split(",").filter(Boolean) };
    } else if (rows) {
      const pair = parsePair(rows);
      if (!pair || !Number.isInteger(pair[0]) || !Number.isInteger(pair[1])) {
        return fail(`nole read: --rows must be offset:limit`, 2);
      }
      rowSlice = { offset: pair[0], limit: pair[1] };
    }

    let range: { startSec: number; endSec: number } | undefined;
    const rangeOption = option(parsed, "range");
    if (rangeOption) {
      const pair = parsePair(rangeOption);
      if (!pair || pair[1] <= pair[0]) {
        return fail(`nole read: --range must be start:end, in seconds`, 2);
      }
      range = { startSec: pair[0], endSec: pair[1] };
    }

    const format = option(parsed, "format") ?? "xml";
    if (format !== "xml" && format !== "jsonl") {
      return fail(`nole read: --format must be xml or jsonl`, 2);
    }

    const result = await readNodes(run, scope, nodeIds);
    const byType = (type: string) =>
      [...new Set(result.nodes.filter((node) => node.type === type).map((node) => node.id))];

    const rendered = await renderReadNodes(result, {
      withPosition: !parsed.flags.has("no-position"),
      // Le schéma d'écriture d'un blocknote pèse ~2 Ko et revient à chaque
      // lecture : dans le shell, on le demande.
      schemas: parsed.flags.has("schemas"),
      // Pas de pixels ici : le hint renvoie à view_image quand il existe.
      isMultimodal: multimodal,
      ...(pages && {
        pdfPages: byType("pdf").map((nodeId) => ({ nodeId, pages: pages! })),
      }),
      ...(rowSlice && {
        tableRows: byType("table").map((nodeId) => ({ nodeId, ...rowSlice })),
      }),
      ...(range && {
        mediaRanges: [...byType("audio"), ...byType("video")].map((nodeId) => ({
          nodeId,
          ...range!,
        })),
      }),
    });

    const failures = result.nodes.filter((node) => !node.ok);
    const stdout =
      format === "jsonl"
        ? result.nodes
            .map((node, index) =>
              JSON.stringify({
                id: node.id,
                type: node.type,
                title: node.ok ? node.title : null,
                ok: node.ok,
                error: node.ok ? null : node.error,
                // `content`, pas `xml` : le nom que le modèle devine quand
                // il écrit son filtre jq sans avoir lu --help.
                content: rendered.nodes[index].xml,
              }),
            )
            .join("\n")
        : rendered.text;
    return {
      ...ok(stdout),
      ...(failures.length > 0 && {
        stderr: failures
          .map((node) => `nole read: ${node.id}: not found\n`)
          .join(""),
        exitCode: 1,
      }),
    };
  },
};
