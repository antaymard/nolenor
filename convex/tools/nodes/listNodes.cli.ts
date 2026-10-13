import {
  fail,
  ok,
  option,
  parseArgs,
  tsvField,
  type CliCommand,
} from "../shell/cli";
import { listNodes, type ListNodesFilters } from "./listNodes";

/**
 * Adaptateur CLI de `listNodes` : `nole ls`. Pas de plafond (le shell a
 * `head`), une ligne par node, des formats faits pour être pipés.
 */

const HELP = `Usage: nole ls [options]

List the nodes of the canvas. One line per node, no limit.

Output (default, tab-separated):
  id  type  title  x  y  frameId  color  updatedAt
  Empty field when there is none. updatedAt is the last edit of the content
  (ISO 8601, UTC); moving or recoloring a node does not change it. With
  --linked-to, a 9th column holds the labels of the edges followed.
Order: most recently edited first. To sort otherwise, pipe into sort, e.g.
by title:
  nole ls | sort -t "$(printf '\\t')" -k3

Options:
  --type <type>         Only this node type (repeatable, or comma-separated):
                        blocknote, table, image, pdf, link, frame, audio, video…
  --frame <id>          Only the direct children of this frame
  --linked-to <id>      Only the nodes connected to this one by an edge
  --direction <dir>     With --linked-to: in (sources), out (targets), both
                        (default)
  --near <id>           Only the nodes within 500 units of this one (the
                        reference node itself included)
  --area <x1,y1,x2,y2>  Only the nodes whose position (top-left corner) is
                        in this box
  --format <fmt>        tsv (default), jsonl, or ids (one id per line)

Filters combine with AND. Positions are world coordinates. An unknown
--frame or --linked-to id is an error (exit 1), not an empty list.

Examples:
  nole ls --type table
  nole ls --frame F12ab --format ids | nole read -
  nole ls | grep -i budget
  nole ls | awk -F'\\t' '$8 >= "2026-10-01"'      # edited since October 1`;

const DIRECTIONS = { in: "input", out: "output", both: "both" } as const;

export const nodeLsCommand: CliCommand = {
  name: "ls",
  summary: "list the nodes of the canvas (filters, no limit)",
  help: HELP,
  async run(args, { run, scope }) {
    const parsed = parseArgs(args, {
      options: [
        "type",
        "frame",
        "linked-to",
        "direction",
        "near",
        "area",
        "format",
      ],
    });
    if ("error" in parsed) return fail(`nole ls: ${parsed.error}`, 2);
    if (parsed.flags.has("help")) return ok(HELP);
    if (parsed.positionals.length > 0) {
      return fail(`nole ls: unexpected argument "${parsed.positionals[0]}"`, 2);
    }

    const filters: ListNodesFilters = {};
    const types = (parsed.options.get("type") ?? [])
      .flatMap((value) => value.split(","))
      .map((type) => type.trim())
      .filter(Boolean);
    if (types.length > 0) filters.types = types;

    const frame = option(parsed, "frame");
    if (frame) filters.frameId = frame;

    const linkedTo = option(parsed, "linked-to");
    const direction = option(parsed, "direction") ?? "both";
    if (!(direction in DIRECTIONS)) {
      return fail(`nole ls: --direction must be in, out or both`, 2);
    }
    if (linkedTo) {
      filters.linkedTo = {
        nodeId: linkedTo,
        direction: DIRECTIONS[direction as keyof typeof DIRECTIONS],
      };
    }

    const near = option(parsed, "near");
    if (near) filters.near = { nodeId: near };

    const area = option(parsed, "area");
    if (area) {
      const coordinates = area.split(",").map(Number);
      if (
        coordinates.length !== 4 ||
        coordinates.some((value) => !Number.isFinite(value))
      ) {
        return fail(`nole ls: --area must be x1,y1,x2,y2`, 2);
      }
      const [x1, y1, x2, y2] = coordinates;
      filters.area = { x1, y1, x2, y2 };
    }

    const format = option(parsed, "format") ?? "tsv";
    if (!["tsv", "jsonl", "ids"].includes(format)) {
      return fail(`nole ls: --format must be tsv, jsonl or ids`, 2);
    }

    const result = await listNodes(run, scope, filters);
    if (!result.ok) return fail(`nole ls: ${result.error}`);

    const lines = result.nodes.map((node) => {
      const x = Math.trunc(node.x);
      const y = Math.trunc(node.y);
      const updatedAt =
        node.updatedAt === null ? null : new Date(node.updatedAt).toISOString();
      if (format === "ids") return node.id;
      if (format === "jsonl") {
        return JSON.stringify({
          id: node.id,
          type: node.type,
          title: node.title,
          x,
          y,
          frameId: node.frameId,
          color: node.color,
          updatedAt,
          ...(linkedTo && { edgeLabels: node.edgeLabels }),
        });
      }
      return [
        node.id,
        node.type,
        node.title,
        x,
        y,
        node.frameId,
        node.color,
        updatedAt,
        ...(linkedTo ? [node.edgeLabels.join("; ")] : []),
      ]
        .map(tsvField)
        .join("\t");
    });
    return ok(lines.join("\n"));
  },
};
