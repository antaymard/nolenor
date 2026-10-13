import type * as JustBash from "just-bash";
import type { ToolRunCtx } from "../runtime";
import type { ToolScope } from "../scope";
import { runNole } from "./nole";

/**
 * Le shell de l'agent : just-bash, un bash virtuel en TypeScript — un
 * interpréteur et un système de fichiers en mémoire, sans processus ni
 * disque. Les commandes Unix usuelles (grep, sed, awk, jq, sort…) et `nole`,
 * qui lit le canvas.
 *
 * Un shell neuf par appel : rien ne survit d'un appel à l'autre, ni fichier
 * ni variable. Pas de réseau, ni Python ni JavaScript (désactivés par défaut
 * dans just-bash, et laissés ainsi).
 *
 * just-bash n'est jamais importé statiquement : le registre des tools est
 * aussi bundlé dans le runtime V8 (routeur HTTP du MCP), où ce paquet n'a
 * rien à faire. Il est chargé à l'exécution, dans l'action Node qui exécute
 * le tool — même mécanisme que jsdom (cf. ia/helpers/headlessBlockNote.ts,
 * `_externalDeps.ts` et `convex.json`).
 */

/** Au-delà, l'appel est interrompu (le lease d'un tool est de 10,5 min). */
const MAX_EXECUTION_MS = 120_000;

function loadJustBash(): typeof JustBash {
  const g = globalThis as { require?: (name: string) => unknown };
  if (!g.require) {
    throw new Error(
      'Cannot load just-bash: require() is not available. Ensure this runs in a "use node" action.',
    );
  }
  return g.require("just-bash") as typeof JustBash;
}

export type ShellResult = { stdout: string; stderr: string; exitCode: number };

export async function runShell(
  script: string,
  {
    run,
    scope,
    multimodal,
  }: { run: ToolRunCtx; scope: ToolScope; multimodal: boolean },
): Promise<ShellResult> {
  const { Bash, defineCommand, decodeBytesToUtf8 } = loadJustBash();

  const nole = defineCommand("nole", async (args, ctx) =>
    runNole(args, {
      run,
      scope,
      multimodal,
      stdin: decodeBytesToUtf8(ctx.stdin),
    }),
  );

  const bash = new Bash({
    cwd: "/home/user",
    customCommands: [nole],
    executionLimitProfile: "hardened",
    executionLimits: {
      maxExecutionTimeMs: MAX_EXECUTION_MS,
      maxOutputSize: 4 * 1024 * 1024,
      maxFileSystemBytes: 64 * 1024 * 1024,
    },
  });

  const result = await bash.exec(script);
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
  };
}
