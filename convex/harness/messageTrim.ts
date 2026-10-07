import type { MessageDoc } from "@convex-dev/agent";
import { ASK_USER, RUN_SUBAGENT } from "./kernelTools";

/**
 * Allège un vieux message de ce qui fait l'essentiel de la table `messages`
 * du composant agent, et que personne ne relira :
 * - le contenu de tool : résultats de lecture (nodes, pages web, recherches)
 *   et arguments d'écriture (blocs, code d'app). Il vit déjà ailleurs — sur
 *   le canvas, sur le web — et le modèle peut le relire ;
 * - les métadonnées chiffrées du raisonnement (signatures, détails renvoyés
 *   par le provider) : elles ne servent qu'à poursuivre un raisonnement en
 *   cours. Son texte reste.
 *
 * Le reste ne bouge pas : texte, réponses, texte du raisonnement, et
 * l'`explanation` des appels, qui donne leur libellé dans le chat.
 */

/** En dessous (JSON), une part de tool n'est pas touchée : rien à y gagner. */
export const TRIM_MIN_CHARS = 2000;
/** Idem pour les métadonnées d'une part de raisonnement, plus nombreuses. */
export const REASONING_META_MIN_CHARS = 200;

/** Leur contenu s'affiche dans le chat : la question posée, le rapport. */
const KEPT_TOOLS = new Set([ASK_USER, RUN_SUBAGENT]);

const REMOVED_OUTPUT =
  "[Output removed after 30 days to save storage. Run the tool again if you need it.]";
const REMOVED_INPUT = "Input removed after 30 days to save storage.";

type Message = NonNullable<MessageDoc["message"]>;
type Part = Record<string, unknown>;

function size(value: unknown): number {
  return value === undefined ? 0 : JSON.stringify(value).length;
}

/** La part allégée, `"drop"` pour la retirer, `null` pour la garder telle quelle. */
function trimPart(part: Part): Part | "drop" | null {
  if (typeof part.toolName === "string" && KEPT_TOOLS.has(part.toolName)) {
    return null;
  }
  if (part.type === "tool-result") {
    const { output, result, args, experimental_content, ...rest } = part;
    if (
      size(output) + size(result) + size(args) + size(experimental_content) <
      TRIM_MIN_CHARS
    ) {
      return null;
    }
    return { ...rest, output: { type: "text", value: REMOVED_OUTPUT } };
  }
  if (part.type === "tool-call") {
    const { input, args, ...rest } = part;
    if (size(input) + size(args) < TRIM_MIN_CHARS) return null;
    const explanation = (input as { explanation?: unknown } | undefined)
      ?.explanation;
    return {
      ...rest,
      input: {
        ...(typeof explanation === "string" ? { explanation } : {}),
        _removed: REMOVED_INPUT,
      },
    };
  }
  if (part.type === "reasoning") {
    const { signature, providerOptions, providerMetadata, ...rest } = part;
    if (
      size(signature) + size(providerOptions) + size(providerMetadata) <
      REASONING_META_MIN_CHARS
    ) {
      return null;
    }
    return rest;
  }
  // Un raisonnement chiffré, sans texte à montrer.
  if (part.type === "redacted-reasoning") {
    return size(part) < REASONING_META_MIN_CHARS ? null : "drop";
  }
  return null;
}

/** Le message allégé, ou `null` s'il n'y a rien à alléger. */
export function trimMessage(message: Message): Message | null {
  if (!Array.isArray(message.content)) return null;
  let changed = false;
  const content: Part[] = [];
  for (const part of message.content as Part[]) {
    const trimmed = trimPart(part);
    if (trimmed === null) {
      content.push(part);
      continue;
    }
    changed = true;
    if (trimmed !== "drop") content.push(trimmed);
  }
  return changed ? ({ ...message, content } as Message) : null;
}
