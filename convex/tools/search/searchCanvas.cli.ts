import { nodeTypeValues, type NodeType } from "../../schemas/nodeTypeSchema";
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
  SEARCH_MAX_LIMIT,
  searchCanvas,
  type SearchSnippet,
} from "./searchCanvas";

/**
 * Adaptateur CLI de `searchCanvas` : `nole search`. Une ligne par extrait
 * (ou par node avec `--by-node`), l'état de la recherche sur stderr, et le
 * code de sortie de grep : 1 quand rien ne correspond.
 */

const MAX_LIMIT = SEARCH_MAX_LIMIT;
const MAX_SNIPPETS = 5;

const HELP = `Usage: nole search [options] <keywords…>

Search the canvas content (documents, tables, PDF pages, image descriptions,
transcripts). Ranked hits, one line each.

Keywords use operators: bare words are all required in the same node,
'"exact phrase"', -excluded, a OR b. Quote the whole query for the shell:
  nole search '"launch plan" -draft'

Output (default, tab-separated):
  nodeId  type  chunkType  score  where  title  snippet
  chunkType: node (the node's own content), page (a PDF page), annotation
  (a PDF annotation), transcript (audio/video). where: p<page> for a PDF,
  <m:ss> for a transcript, else empty. Keyword-only scores are all 0: the
  order is then the document order. --format jsonl adds sources (which
  branch matched: keyword, semantic, or both).
With --by-node: nodeId  type  hits  bestScore  title  snippets

Options:
  --semantic <text>   Conceptual search: short affirmative statements, never a
                      question. Alone, or with keywords (fused ranking)
  --type <type>       Only this node type (repeatable, or comma-separated)
  --in <id,id…|->     Only within these nodes; "-" reads them from stdin
  --limit <n>         Number of hits (default 20, max ${MAX_LIMIT})
  --by-node           One line per node instead of one per hit
  --snippets <n>      With --by-node: up to n distinct snippets per node
                      (default 1, max ${MAX_SNIPPETS}), joined by " … "
  --format <fmt>      tsv (default), jsonl, or ids (unique node ids, ranked)

Notes on stderr: results widened, more results beyond --limit, semantic
search down. Exit code 1 when nothing matches, with a hint on stderr.

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
      options: ["semantic", "type", "in", "limit", "format", "snippets"],
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

    const snippetsOption = option(parsed, "snippets");
    const snippetCount = snippetsOption === undefined ? 1 : Number(snippetsOption);
    if (
      !Number.isInteger(snippetCount) ||
      snippetCount < 1 ||
      snippetCount > MAX_SNIPPETS
    ) {
      return fail(`nole search: --snippets must be 1 to ${MAX_SNIPPETS}`, 2);
    }
    if (snippetsOption !== undefined && !byNode) {
      return fail(`nole search: --snippets goes with --by-node`, 2);
    }

    const result = await searchCanvas(run, scope, {
      keyword: keyword || undefined,
      semantic: semantic || undefined,
      nodeIds,
      nodeTypes: types.length > 0 ? (types as NodeType[]) : undefined,
      // Par node : autant de chunks que possible (moins un, pour la sonde
      // de `more`), pour compter les hits.
      limit: byNode ? MAX_LIMIT - 1 : limit,
    });

    const notes: string[] = [];
    if (result.degraded) {
      notes.push("note: semantic search unavailable, keyword results only");
    }
    if (result.relaxed) {
      notes.push(
        result.mode === "semantic"
          ? "note: low-confidence semantic matches only; rephrase the concept, or add keywords to anchor it"
          : "note: nothing matched every constraint, results are approximate; drop a term or an operator to tighten",
      );
    }

    let lines: string[];
    let more: boolean;
    if (byNode) {
      const groups = groupByNode(result.hits);
      more = result.more || groups.length > limit;
      lines = groups.slice(0, limit).map((group) => {
        const title = group.title ?? "Untitled";
        const snippets = bestSnippets(group, snippetCount);
        if (format === "ids") return group.nodeId;
        if (format === "jsonl") {
          return JSON.stringify({
            nodeId: group.nodeId,
            type: group.nodeType,
            hits: group.hitCount,
            bestScore: roundScore(group.bestScore),
            title,
            snippets: snippets.map((snippet) => ({
              snippet: snippet.snippet,
              page: snippet.page,
              sectionTitle: snippet.sectionTitle,
              startSec: snippet.startSec,
              endSec: snippet.endSec,
            })),
          });
        }
        return [
          group.nodeId,
          group.nodeType,
          group.hitCount,
          roundScore(group.bestScore),
          title,
          snippets
            .map((snippet) =>
              where(snippet) ? `[${where(snippet)}] ${snippet.snippet}` : snippet.snippet,
            )
            .join(" … "),
        ]
          .map(tsvField)
          .join("\t");
      });
    } else {
      // Même classement que search_canvas : score, puis ordre du document.
      const ranked = [...result.hits].sort(
        (a, b) => b.score - a.score || a.order - b.order,
      );
      more = result.more;
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
                    // keyword, semantic, ou les deux en hybride.
                    sources: hit.sources,
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
                    hit.chunkType,
                    roundScore(hit.score),
                    where(hit),
                    hit.title ?? "",
                    hit.snippet,
                  ]
                    .map(tsvField)
                    .join("\t"),
            );
    }

    if (lines.length === 0) {
      notes.push(
        "nole search: no match; try spelling variants, a shorter keyword, fewer operators, or --semantic with a rephrased statement",
      );
    } else if (more) {
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
