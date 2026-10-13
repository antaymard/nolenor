import type { ToolRunCtx } from "../runtime";
import type { ToolScope } from "../scope";

/**
 * Le contrat d'une commande `nole …`, indépendant de just-bash : une commande
 * reçoit ses arguments et son stdin, et rend stdout, stderr et un code de
 * sortie. C'est ce qui la rend testable sans shell, et rebranchable ailleurs
 * (un vrai binaire `nole` qui parlerait à l'API HTTP).
 */

export type CliContext = {
  run: ToolRunCtx;
  scope: ToolScope;
  /** Le stdin de la commande, décodé (vide hors d'un pipe). */
  stdin: string;
};

export type CliResult = { stdout: string; stderr: string; exitCode: number };

export type CliCommand = {
  name: string;
  /** Une ligne, pour `nole --help`. */
  summary: string;
  /** L'aide complète, pour `nole <commande> --help`. */
  help: string;
  run(args: string[], ctx: CliContext): Promise<CliResult>;
};

export const ok = (stdout: string): CliResult => ({
  stdout: stdout.length > 0 && !stdout.endsWith("\n") ? `${stdout}\n` : stdout,
  stderr: "",
  exitCode: 0,
});

/** Code 1 : la commande a échoué ; 2 : elle a été mal appelée. */
export const fail = (message: string, exitCode = 1): CliResult => ({
  stdout: "",
  stderr: `${message}\n`,
  exitCode,
});

export type ParsedArgs = {
  /** Valeurs par option, dans l'ordre (une option répétable en a plusieurs). */
  options: Map<string, string[]>;
  flags: Set<string>;
  positionals: string[];
};

/**
 * `--name value`, `--name=value`, `--flag`, et le reste en positionnels.
 * `-` reste un positionnel (stdin, par convention). Une option inconnue est
 * une erreur : un modèle qui invente un flag doit l'apprendre, pas le voir
 * ignoré en silence.
 */
export function parseArgs(
  args: string[],
  spec: { options?: readonly string[]; flags?: readonly string[] },
): ParsedArgs | { error: string } {
  const options = new Map<string, string[]>();
  const flags = new Set<string>();
  const positionals: string[] = [];
  const knownOptions = new Set(spec.options ?? []);
  const knownFlags = new Set([...(spec.flags ?? []), "help"]);

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "-h") {
      flags.add("help");
      continue;
    }
    if (!arg.startsWith("--") || arg === "--") {
      positionals.push(arg);
      continue;
    }
    const [name, inline] = arg.slice(2).split(/=(.*)/s, 2);
    if (knownFlags.has(name) && inline === undefined) {
      flags.add(name);
      continue;
    }
    if (!knownOptions.has(name)) {
      return { error: `unknown option --${name}` };
    }
    const value = inline ?? args[++index];
    if (value === undefined) {
      return { error: `--${name} needs a value` };
    }
    options.set(name, [...(options.get(name) ?? []), value]);
  }
  return { options, flags, positionals };
}

/** La dernière valeur d'une option. */
export function option(parsed: ParsedArgs, name: string): string | undefined {
  const values = parsed.options.get(name);
  return values?.[values.length - 1];
}

/** Les ids lus sur stdin : le premier champ de chaque ligne (cf. `nole ls`). */
export function idsFromStdin(stdin: string): string[] {
  return stdin
    .split("\n")
    .map((line) => line.trim().split(/\s+/)[0])
    .filter((id): id is string => Boolean(id));
}

/** Un champ de ligne TSV : ni tabulation, ni retour à la ligne. */
export function tsvField(value: string | number | null): string {
  return value === null ? "" : String(value).replace(/[\t\r\n]+/g, " ");
}
