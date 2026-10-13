import { createTool } from "@convex-dev/agent";
import { z } from "zod";
import { toolAgentNames, type ThreadCtx } from "../../ia/agentConfig";
import {
  EXPLANATION_FIELD,
  toolError,
  type ToolConfig,
} from "../../ia/tools/toolHelpers";
import { canvasScope } from "../scope";
import { runShell, type ShellResult } from "./shell";

/**
 * Le tool `bash` : un shell virtuel où `nole` lit le canvas. Ne fait que
 * lire : son scope n'a aucun droit d'écriture, et `nole` n'a aucune
 * commande qui écrive.
 */

/** Ce que le modèle lit au plus d'un appel ; au-delà, il filtre. */
export const MAX_OUTPUT_CHARS = 30_000;

export const bashToolConfig: ToolConfig = {
  name: "bash",
  // Lecture seule, et rien ne survit à l'appel : le rejouer ne duplique rien.
  replay: "safe",
  authorized_agents: [toolAgentNames.nole, toolAgentNames.worker],
};

const DESCRIPTION = `Run a bash script in a sandboxed virtual shell, to explore and process the canvas in bulk. Read-only: nothing you do here changes the canvas — use the other tools to write.

The \`nole\` command reads the current canvas:
- \`nole ls [--type T] [--frame ID] [--linked-to ID] [--near ID] [--format tsv|jsonl|ids]\`: every matching node in canvas order, one line each (id, type, title, x, y, frameId, color), no limit.
- \`nole read <id>…\` or \`… | nole read -\`: the same XML as read_nodes (without the write schemas unless --schemas), ids from arguments or from the first field of each stdin line (at most 200 nodes per call); \`--format jsonl\` gives one JSON object per node for jq.
- \`nole search <keywords> [--semantic TEXT] [--type T] [--in IDS|-] [--by-node] [--format tsv|jsonl|ids]\`: ranked hits in the content (documents, tables, PDF pages, transcripts), one line each (nodeId, type, score, where, title, snippet); same engine and query syntax as search_canvas. Exit code 1 when nothing matches.
- \`nole --help\`, \`nole <command> --help\`: all options. A command exits non-zero when it fails (unknown id, unknown frame, no match for search), so \`&&\` and \`||\` work.

Standard tools are available: grep, sed, awk, jq, sort, uniq, head, tail, wc, cut, tr, xargs, diff… Pipes, redirections, loops, variables and files under /tmp all work within one call. Each call starts a fresh shell: files and variables do not survive to the next call, so do the whole job in one script. No network, no Python.

Use it when list_nodes / read_nodes would take many calls or flood your context: searching text across many nodes, counting, comparing, extracting a few lines from long documents. Output is cut at ${MAX_OUTPUT_CHARS} characters: filter (grep, head) rather than printing everything.

Examples:
- \`nole ls --type blocknote --format ids | nole read - | grep -n -i "budget"\`
- \`nole ls --format jsonl | jq -r 'select(.title | test("Q3"; "i")) | .id'\`
- \`nole search budget --format ids | nole read - | grep -n "40k"\`
- \`nole ls | cut -f2 | sort | uniq -c\``;

/**
 * Le texte que lit le modèle : stdout, stderr s'il y en a, le code s'il est
 * non nul. Sans échappement : le XML de `nole read` doit arriver tel quel,
 * pour que ses blocs puissent être renvoyés aux tools d'écriture.
 */
export function renderShellResult(result: ShellResult): string {
  const parts: string[] = [];
  let budget = MAX_OUTPUT_CHARS;
  const section = (tag: string, content: string) => {
    // Le dernier retour à la ligne d'une commande est celui de la balise.
    const text = content.endsWith("\n") ? content.slice(0, -1) : content;
    if (text.length === 0) return;
    const shown = text.slice(0, Math.max(budget, 0));
    budget -= shown.length;
    const cut = text.length - shown.length;
    parts.push(
      `<${tag}>\n${shown}${
        cut > 0
          ? `\n[… ${cut} more characters cut. Filter the output (grep, head, tail) instead of printing it all.]`
          : ""
      }\n</${tag}>`,
    );
  };
  section("stdout", result.stdout);
  section("stderr", result.stderr);
  if (result.exitCode !== 0) parts.push(`<exitCode>${result.exitCode}</exitCode>`);
  return parts.length > 0 ? parts.join("\n") : "(no output)";
}

export default function bashTool({ threadCtx }: { threadCtx: ThreadCtx }) {
  const scope = {
    ...canvasScope({
      userId: threadCtx.authUserId,
      canvasId: threadCtx.canvasId,
    }),
    write: "none" as const,
  };

  return createTool({
    description: DESCRIPTION,
    inputSchema: z.object({
      explanation: EXPLANATION_FIELD,
      script: z.string().min(1).describe("The bash script to run."),
    }),
    execute: async (ctx, input): Promise<string> => {
      try {
        return renderShellResult(
          await runShell(input.script, { run: ctx, scope }),
        );
      } catch (error) {
        console.error("Bash tool error:", error);
        return toolError(
          `The shell failed to run: ${error instanceof Error ? error.message : "Unknown error"}.`,
        );
      }
    },
  });
}
