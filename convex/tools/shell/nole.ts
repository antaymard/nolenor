import { nodeLsCommand } from "../nodes/listNodes.cli";
import { nodeReadCommand } from "../nodes/readNodes.cli";
import { fail, ok, type CliCommand, type CliContext, type CliResult } from "./cli";

/**
 * La commande `nole` : le canvas, en lecture, depuis le shell. Chaque
 * sous-commande est l'adaptateur CLI d'un noyau de `tools/` (`*.cli.ts`).
 */

const COMMANDS: CliCommand[] = [nodeLsCommand, nodeReadCommand];

export const NOLE_HELP = `Usage: nole <command> [options]

Read the current canvas (read-only).

Commands:
${COMMANDS.map((command) => `  ${command.name.padEnd(6)} ${command.summary}`).join("\n")}

Run "nole <command> --help" for its options.`;

export async function runNole(
  args: string[],
  ctx: CliContext,
): Promise<CliResult> {
  const [name, ...rest] = args;
  if (!name || name === "--help" || name === "-h" || name === "help") {
    return ok(NOLE_HELP);
  }
  const command = COMMANDS.find((candidate) => candidate.name === name);
  if (!command) {
    return fail(`nole: unknown command "${name}"\n\n${NOLE_HELP}`, 2);
  }
  try {
    return await command.run(rest, ctx);
  } catch (error) {
    return fail(
      `nole ${name}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
