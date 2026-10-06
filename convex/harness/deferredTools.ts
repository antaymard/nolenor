import { tool, type ToolSet } from "ai";
import { z } from "zod";

/**
 * Tools différés : décrits au modèle seulement une fois chargés.
 *
 * Chaque tool décrit coûte son schéma à chaque appel modèle. Les tools rares
 * restent donc hors de la liste, et `load_tools` (un tool du kernel, résolu
 * dans la mutation qui termine la génération, sans action) les ajoute pour
 * le reste du run. Charger un tool change le début du prompt : le cache
 * repart de zéro une fois, à ce step-là.
 */

export const LOAD_TOOLS = "load_tools";

/** La première phrase d'une description, pour le catalogue. */
function summary(description: string | undefined): string {
  const text = (description ?? "").replace(/\s+/g, " ").trim();
  const first = /^(.+?[.!?])(\s|$)/.exec(text)?.[1] ?? text;
  return first.length > 160 ? `${first.slice(0, 157)}…` : first;
}

/**
 * Les tools tels que le modèle les reçoit : visibles (cf. `visibleTools`), et
 * sans leur `execute` — le step s'arrête sur les tool calls, que la harness
 * exécute dans leurs propres tâches.
 */
export function modelTools(
  tools: ToolSet,
  deferred: readonly string[],
  loaded: readonly string[],
): ToolSet {
  return Object.fromEntries(
    Object.entries(visibleTools(tools, deferred, loaded)).map(([name, tool]) => [
      name,
      { ...tool, execute: undefined },
    ]),
  );
}

/**
 * Ce que le modèle voit : les tools non différés, ceux déjà chargés, et
 * `load_tools` tant qu'il reste quelque chose à charger.
 */
export function visibleTools(
  tools: ToolSet,
  deferred: readonly string[],
  loaded: readonly string[],
): ToolSet {
  const hidden = Object.keys(tools).filter(
    (name) => deferred.includes(name) && !loaded.includes(name),
  );
  if (hidden.length === 0) return tools;

  const visible: ToolSet = Object.fromEntries(
    Object.entries(tools).filter(([name]) => !hidden.includes(name)),
  );
  const catalog = hidden
    .map((name) => `- ${name}: ${summary(tools[name].description)}`)
    .join("\n");
  visible[LOAD_TOOLS] = tool({
    description: `Load tools that are not available yet, by exact name. They become callable from your next step, for the rest of this response. Load only what you are about to use.\n\nLoadable tools:\n${catalog}`,
    inputSchema: z.object({
      explanation: z
        .string()
        .describe("Short label shown to the user, in their language."),
      names: z.array(z.string()).min(1),
    }),
  });
  return visible;
}

/** Résout un appel à `load_tools` : la liste à jour et ce que le modèle lira. */
export function loadTools(
  input: unknown,
  deferred: readonly string[],
  loaded: readonly string[],
): { loaded: string[]; result: string } {
  const requested =
    typeof input === "object" &&
    input !== null &&
    Array.isArray((input as { names?: unknown }).names)
      ? (input as { names: unknown[] }).names.filter(
          (name): name is string => typeof name === "string",
        )
      : [];
  const known = requested.filter((name) => deferred.includes(name));
  const unknown = requested.filter((name) => !deferred.includes(name));
  const next = [...new Set([...loaded, ...known])];

  const lines = [];
  if (known.length > 0) {
    lines.push(`Loaded: ${known.join(", ")}. Callable from your next step.`);
  }
  if (unknown.length > 0) {
    lines.push(
      `Not loadable: ${unknown.join(", ")}. Loadable tools: ${deferred.join(", ")}.`,
    );
  }
  return { loaded: next, result: lines.join("\n") || "Nothing to load." };
}
