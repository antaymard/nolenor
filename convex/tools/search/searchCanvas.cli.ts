import { nodeTypeValues, type NodeType } from "../../schemas/nodeTypeSchema";
import { readNodeTitles } from "../nodes/nodeContents";
import {
  fail,
  idsFromStdin,
  ok,
  option,
  parseArgs,
  tsvField,
  type CliCommand,
  type CliResult,
} from "../shell/cli";
import {
  bestSnippets,
  groupByNode,
  searchCanvas,
  type SearchSnippet,
} from "./searchCanvas";

/**
 * Adaptateur CLI de `searchCanvas` : `nole search`. Une ligne par extrait
 * (ou par node avec `--by-node`), l'état de la recherche sur stderr, et le
 * code de sortie de grep : 1 quand rien ne correspond.
 */

const MAX_LIMIT = 50;

const HELP = `Usage: nole search [options] <keywords…>

Search the canvas content (documents, tables, PDF pages, image descriptions,
transcripts). Ranked hits, one line each.

Keywords use operators: bare words are all required in the same node,
'"exact phrase"', -excluded, a OR b. Quote the whole query for the shell:
  nole search '"launch plan" -draft'

Output (default, tab-separated): nodeId  type  score  where  title  snippet
  where: p<page> for a PDF page, <m:ss> for a transcript, else empty.
With --by-node: nodeId  type  hits  bestScore  title  bestSnippet

Options:
  --semantic <text>   Conceptual search: short affirmative statements, never a
                      question. Alone, or with keywords (fused ranking)
  --type <type>       Only this node type (repeatable, or comma-separated)
  --in <id,id…|->     Only within these nodes; "-" reads them from stdin
  --limit <n>         Number of hits (default 20, max ${MAX_LIMIT})
  --by-node           One line per node instead of one per hit
  --format <fmt>      tsv (default), jsonl, or ids (unique node ids, ranked)

Notes on stderr: results widened, cut at the limit, or semantic search down.
Exit code 1 when nothing matches.

Examples:
  nole search budget --type pdf
  nole search --semantic "hiring plan for next year" --by-node
  nole ls --frame F12ab --format ids | nole search --in - deadline
  nole search budget --format ids | nole read -`;

function formatTime(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

function where(snippet: Pick<SearchSnippet, "page" | "startSec">): string {
  if (typeof snippet.page === "number") return `p${snippet.page}`;
  if (typeof snippet.startSec === "number") return formatTime(snippet.startSec);
  return "";
}

const roundScore = (score: number) => Math.round(score * 10000) / 10000;

export const searchCommand: CliCommand = {
  name: "search",
  summary: "search the canvas content (keywords and/or --semantic)",
  help: HELP,
  async run(args, { run, scope, stdin }): Promise<CliResult> {
    const parsed = parseArgs(args, {
      options: ["semantic", "type", "in", "limit", "format"],
      flags: ["by-node"],
    });
    if ("error" in parsed) return fail(`nole search: ${parsed.error}`, 2);
    if (parsed.flags.has("help")) return ok(HELP);

    const keyword = parsed.positionals.join(" ").trim();
    const semantic = option(parsed, "semantic")?.trim() ?? "";
    if (keyword.length === 0 && semantic.length === 0) {
      return fail(`nole search: give keywords, --semantic, or both`, 2);
    }
    if (
      (keyword.length > 0 && keyword.length < 2) ||
      (semantic.length > 0 && semantic.length < 2)
    ) {
      return fail(`nole search: a query needs at least 2 characters`, 2);
    }

    const types = (parsed.options.get("type") ?? [])
      .flatMap((value) => value.split(","))
      .map((type) => type.trim())
      .filter(Boolean);
    const unknownType = types.find(
      (type) => !(nodeTypeValues as readonly string[]).includes(type),
    );
    if (unknownType) {
      return fail(
        `nole search: unknown type "${unknownType}" (${nodeTypeValues.join(", ")})`,
        2,
      );
    }

    let nodeIds: string[] | undefined;
    const within = parsed.options.get("in");
    if (within) {
      nodeIds = within.flatMap((value) =>
        value === "-" ? idsFromStdin(stdin) : value.split(",").filter(Boolean),
      );
      if (nodeIds.length === 0) return fail(`nole search: --in lists no node`);
    }

    const limitOption = option(parsed, "limit");
    const limit = limitOption === undefined ? 20 : Number(limitOption);
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      return fail(`nole search: --limit must be 1 to ${MAX_LIMIT}`, 2);
    }

    const format = option(parsed, "format") ?? "tsv";
    if (!["tsv", "jsonl", "ids"].includes(format)) {
      return fail(`nole search: --format must be tsv, jsonl or ids`, 2);
    }
    const byNode = parsed.flags.has("by-node");

    const result = await searchCanvas(run, scope, {
      keyword: keyword || undefined,
      semantic: semantic || undefined,
      nodeIds,
      nodeTypes: types.length > 0 ? (types as NodeType[]) : undefined,
      // Par node : autant de chunks que possible, pour compter les hits.
      limit: byNode ? MAX_LIMIT : limit,
    });

    const notes: string[] = [];
    if (result.degraded) {
      notes.push("note: semantic search unavailable, keyword results only");
    }
    if (result.relaxed) {
      notes.push(
        "note: nothing matched every constraint, results are approximate",
      );
    }

    let lines: string[];
    let more: boolean;
    if (byNode) {
      const groups = groupByNode(result.hits);
      more = result.truncated || groups.length > limit;
      const shown = groups.slice(0, limit);
      const titles = await readNodeTitles(
        run,
        scope,
        shown.filter((group) => !group.title).map((group) => group.nodeId),
      );
      lines = shown.map((group) => {
        const title =
          group.title ?? titles.get(group.nodeId)?.title ?? "Untitled";
        const [best] = bestSnippets(group, 1);
        if (format === "ids") return group.nodeId;
        if (format === "jsonl") {
          return JSON.stringify({
            nodeId: group.nodeId,
            type: group.nodeType,
            hits: group.hitCount,
            bestScore: roundScore(group.bestScore),
            title,
            snippet: best?.snippet ?? "",
            page: best?.page,
            startSec: best?.startSec,
          });
        }
        return [
          group.nodeId,
          group.nodeType,
          group.hitCount,
          roundScore(group.bestScore),
          title,
          best?.snippet ?? "",
        ]
          .map(tsvField)
          .join("\t");
      });
    } else {
      // Même classement que search_canvas : score, puis ordre du document.
      const ranked = [...result.hits].sort(
        (a, b) => b.score - a.score || a.order - b.order,
      );
      more = result.truncated || ranked.length > limit;
      const shown = ranked.slice(0, limit);
      lines =
        format === "ids"
          ? [...new Set(shown.map((hit) => hit.nodeId))]
          : shown.map((hit) =>
              format === "jsonl"
                ? JSON.stringify({
                    nodeId: hit.nodeId,
                    type: hit.nodeType,
                    chunkType: hit.chunkType,
                    score: roundScore(hit.score),
                    title: hit.title ?? null,
                    snippet: hit.snippet,
                    page: hit.page,
                    sectionTitle: hit.sectionTitle,
                    startSec: hit.startSec,
                    endSec: hit.endSec,
                  })
                : [
                    hit.nodeId,
                    hit.nodeType,
                    roundScore(hit.score),
                    where(hit),
                    hit.title ?? "",
                    hit.snippet,
                  ]
                    .map(tsvField)
                    .join("\t"),
            );
    }

    if (more && lines.length > 0) {
      notes.push(
        `note: more results exist; raise --limit (max ${MAX_LIMIT}) or narrow with --type / --in`,
      );
    }
    return {
      stdout: lines.length > 0 ? `${lines.join("\n")}\n` : "",
      stderr: notes.length > 0 ? `${notes.join("\n")}\n` : "",
      exitCode: lines.length > 0 ? 0 : 1,
    };
  },
};
