import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx } from "../agentConfig";
import { internal } from "../../_generated/api";
import { toolError, ToolConfig } from "./toolHelpers";

export const patchAppNodeCodeToolConfig: ToolConfig = {
  name: "patch_app_node_code",
  authorized_agents: [
    toolAgentNames.nole,
    toolAgentNames.clone,
    toolAgentNames.supervisor,
    toolAgentNames.worker,
  ],
};

const BEGIN_MARKER = "*** Begin Patch";
const END_MARKER = "*** End Patch";

const ERROR_TARGET_NOT_APP = toolError("Target node must be an app node.");

type ParsedHunk = {
  index: number;
  search: string;
  replacement: string;
};

type ParseResult =
  | { ok: true; hunks: ParsedHunk[] }
  | { ok: false; error: string };

function parsePatch(rawPatch: string): ParseResult {
  const patch = rawPatch.replace(/\r\n/g, "\n").trim();

  if (patch.length === 0) {
    return { ok: false, error: "Patch is empty." };
  }

  const lines = patch.split("\n");

  if (lines[0].trim() !== BEGIN_MARKER) {
    return {
      ok: false,
      error: `Patch must start with "${BEGIN_MARKER}" on its own line.`,
    };
  }
  if (lines[lines.length - 1].trim() !== END_MARKER) {
    return {
      ok: false,
      error: `Patch must end with "${END_MARKER}" on its own line.`,
    };
  }

  const body = lines.slice(1, -1);

  for (const line of body) {
    const trimmed = line.trim();
    if (trimmed === BEGIN_MARKER || trimmed === END_MARKER) {
      return {
        ok: false,
        error: `Only one "${BEGIN_MARKER}" / "${END_MARKER}" block is allowed per call. Put all your hunks (separated by "@@") inside a single block.`,
      };
    }
  }

  const rawHunks: string[][] = [];
  let current: string[] | null = null;

  for (const line of body) {
    if (line.startsWith("@@")) {
      if (current !== null) {
        rawHunks.push(current);
      }
      current = [];
      continue;
    }
    if (current === null) {
      if (line.trim() !== "") {
        return {
          ok: false,
          error: `Unexpected content before the first hunk header "@@": "${line}". Every hunk must start with a "@@" line.`,
        };
      }
      continue;
    }
    current.push(line);
  }
  if (current !== null) {
    rawHunks.push(current);
  }

  if (rawHunks.length === 0) {
    return {
      ok: false,
      error: 'No hunks found. Each hunk must start with a "@@" line.',
    };
  }

  const hunks: ParsedHunk[] = [];

  for (let i = 0; i < rawHunks.length; i++) {
    const lines = [...rawHunks[i]];

    // Trim trailing blank lines that often appear from formatting.
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
    }

    if (lines.length === 0) {
      return { ok: false, error: `Hunk ${i} is empty.` };
    }

    const searchLines: string[] = [];
    const replacementLines: string[] = [];
    let hasContext = false;
    let hasChange = false;

    for (const line of lines) {
      if (line.length === 0) {
        return {
          ok: false,
          error: `Hunk ${i}: blank line is missing its prefix. Prefix every line with " " (context), "+" (added) or "-" (removed). Use a single " " for an empty context line.`,
        };
      }
      const prefix = line[0];
      const content = line.slice(1);
      switch (prefix) {
        case " ":
          searchLines.push(content);
          replacementLines.push(content);
          hasContext = true;
          break;
        case "-":
          searchLines.push(content);
          hasChange = true;
          break;
        case "+":
          replacementLines.push(content);
          hasChange = true;
          break;
        default:
          return {
            ok: false,
            error: `Hunk ${i}: invalid line prefix "${prefix}" on line "${line}". Each line must start with " " (context), "+" (added) or "-" (removed).`,
          };
      }
    }

    if (!hasContext) {
      return {
        ok: false,
        error: `Hunk ${i}: must contain at least one context line (prefixed with a single space) to anchor the patch.`,
      };
    }
    if (!hasChange) {
      return {
        ok: false,
        error: `Hunk ${i}: must contain at least one change line ("+" or "-").`,
      };
    }

    hunks.push({
      index: i,
      search: searchLines.join("\n"),
      replacement: replacementLines.join("\n"),
    });
  }

  return { ok: true, hunks };
}

function countExactMatches(source: string, search: string): number {
  if (!search) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    const found = source.indexOf(search, index);
    if (found === -1) break;
    count += 1;
    index = found + search.length;
  }
  return count;
}

type ApplyResult =
  | { ok: true; code: string }
  | { ok: false; hunkIndex: number; error: string };

function applyHunks(source: string, hunks: ParsedHunk[]): ApplyResult {
  let current = source;
  for (const hunk of hunks) {
    if (hunk.search === hunk.replacement) {
      return {
        ok: false,
        hunkIndex: hunk.index,
        error: `Hunk ${hunk.index}: search and replacement are identical (no-op).`,
      };
    }
    const matches = countExactMatches(current, hunk.search);
    if (matches === 0) {
      return {
        ok: false,
        hunkIndex: hunk.index,
        error: `Hunk ${hunk.index}: no match found for its context + removed lines in the current code. Re-read the node and verify exact whitespace and that an earlier hunk hasn't already changed this region.`,
      };
    }
    if (matches > 1) {
      return {
        ok: false,
        hunkIndex: hunk.index,
        error: `Hunk ${hunk.index}: ${matches} matches found. Add more context lines to make the anchor unique.`,
      };
    }
    current = current.replace(hunk.search, hunk.replacement);
  }
  return { ok: true, code: current };
}

export default function patchAppNodeCodeTool({
  threadCtx,
}: {
  threadCtx: ThreadCtx;
}) {
  const { canvasId } = threadCtx;

  return createTool({
    description: [
      "Apply one or more text patches to an app node's source code, using a unified-diff style format inspired by OpenAI's Apply Patch. Use it when you want to make targeted edits to an existing app node's code, without rewriting the whole code (token-efficient). For wholesale rewrites or initial code, use `set_node_data` with `{ code }` instead.",
      "",
      "Format (single block per call):",
      "*** Begin Patch",
      "@@",
      " unchanged context line (prefixed with a single space)",
      "-line to remove (must match exactly)",
      "+line to add",
      " more context",
      "@@",
      " context for the next hunk",
      "+pure insertion (no `-` line needed)",
      "*** End Patch",
      "",
      "Rules:",
      "- Wrap everything in a single `*** Begin Patch` / `*** End Patch` block.",
      "- Separate each hunk with a line starting with `@@`.",
      "- Inside a hunk, every line must start with ` ` (context), `+` (added) or `-` (removed). No line numbers.",
      "- Each hunk must contain at least one context line and at least one `+` or `-` change.",
      "- The context + removed lines of a hunk must match exactly once in the current code (whitespace included). If multiple matches exist, add more context lines.",
      "- Hunks are applied sequentially on the cumulative source.",
      "- All-or-nothing: if any hunk fails to apply (no match, multiple matches, malformed), no change is written and a structured error is returned identifying the offending hunk.",
      "",
      "Use this tool to make small, targeted edits to an existing app node code without rewriting the whole code (token-efficient). For wholesale rewrites or initial code, use `set_node_data` with `{ code }` instead.",
    ].join("\n"),
    inputSchema: z.object({
      nodeId: z.string().describe("The node ID in the current canvas."),
      patch: z
        .string()
        .min(1)
        .describe(
          "The patch payload, wrapped in `*** Begin Patch` / `*** End Patch`, with one or more `@@` hunks. See tool description for the exact format.",
        ),
      explanation: z.string().describe("3-5 words explaining the edit intent."),
    }),
    execute: async (ctx, input): Promise<string> => {
      console.log(
        `📝 App node patch requested on node ${input.nodeId} (${input.explanation})`,
      );

      try {
        const { nodeId, patch } = input;

        const parsed = parsePatch(patch);
        if (!parsed.ok) {
          return toolError(parsed.error);
        }

        const { node, nodeData } = await ctx.runQuery(
          internal.wrappers.canvasNodeWrappers.getNodeWithNodeData,
          {
            canvasId,
            nodeId,
          },
        );

        if (node.type !== "app" || nodeData.type !== "app") {
          return ERROR_TARGET_NOT_APP;
        }

        const sourceCode =
          typeof nodeData.values.code === "string" ? nodeData.values.code : "";

        const applied = applyHunks(sourceCode, parsed.hunks);
        if (!applied.ok) {
          return toolError(
            `Patch aborted (no changes written). ${applied.error}`,
          );
        }

        await ctx.runMutation(internal.wrappers.nodeDataWrappers.updateValues, {
          _id: nodeData._id,
          values: {
            ...nodeData.values,
            code: applied.code,
          },
          actor: {
            type: "agent",
            userId: threadCtx.authUserId,
            threadId: ctx.threadId,
          },
        });

        console.log(
          `✅ App node patch complete for node ${nodeId} (${parsed.hunks.length} hunk(s))`,
        );

        return `Successfully applied ${parsed.hunks.length} hunk(s) to the app node code.`;
      } catch (error) {
        console.error("App node patch tool error:", error);
        return toolError(
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  });
}
