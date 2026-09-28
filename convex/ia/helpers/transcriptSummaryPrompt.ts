import { z } from "zod";
import { escapeXmlText } from "../../lib/xml";
import { formatTimestamp } from "./transcriptFormatters";

// Prompt et post-traitement des résumés de transcript (titre + résumé par
// passage, vue d'ensemble). Pur, sans `ctx` : testable seul, et utilisé par
// ia/transcriptSummaryRun.ts.
//
// Précision par passage malgré un appel unique pour tout le fichier :
//  - les passages sont délimités PAR NOUS (les chunks `transcript`, ~2 min),
//    jamais redécoupés par le modèle ;
//  - la sortie est un tableau `{id, title, summary}` rapproché par `id`,
//    jamais par position ;
//  - les `id` manquants repartent dans un second appel ciblé.

/** Un passage à résumer : un chunk `transcript`. */
export type SummaryPassage = {
  order: number;
  startSec: number;
  endSec: number;
  text: string;
};

export type PassageSummary = { order: number; title: string; summary: string };

const MAX_TITLE_CHARS = 80;
const MAX_SUMMARY_CHARS = 600;
const MAX_OVERVIEW_CHARS = 2_000;

const passageSummaryItem = z.object({
  id: z.number().int().describe("The id of the passage, copied as is."),
  title: z
    .string()
    .describe("A short title for this passage: 4 to 8 words, no quotes."),
  summary: z
    .string()
    .describe(
      "1 to 3 sentences on what is said in this passage only: the points made, decisions, facts, names.",
    ),
});

/** Sortie d'un appel complet : vue d'ensemble + un résumé par passage. */
export const fullSummarySchema = z.object({
  overview: z
    .string()
    .describe(
      "5 to 10 lines giving an overview of the whole recording: what it is, who speaks, the main topics and conclusions, in order.",
    ),
  passages: z.array(passageSummaryItem),
});

/** Sortie d'un lot ou d'un rattrapage : les passages seulement. */
export const passagesOnlySchema = z.object({
  passages: z.array(passageSummaryItem),
});

/** Sortie de la vue d'ensemble construite à partir des résumés (audio long). */
export const overviewOnlySchema = z.object({
  overview: fullSummarySchema.shape.overview,
});

export const TRANSCRIPT_SUMMARY_SYSTEM = [
  "You summarize the transcript of an audio recording so that a reader, or another AI agent, can get an overview of it and find a passage without reading everything.",
  'The transcript is split into passages of about two minutes, each in a <passage id="…" start="m:ss" end="m:ss"> tag. The split is fixed: never merge, split or skip passages.',
  "Return exactly one entry per passage to summarize, with its id copied as is, in the same order.",
  'Each title and summary must describe only what is said in its own passage. Use the neighbouring passages only to resolve references (who "she" is, which project is meant).',
  "Be factual and specific: keep names, figures, dates and decisions. Do not invent anything that is not in the transcript.",
  "Write in the language of the transcript.",
].join("\n");

function passageXml(passage: SummaryPassage, tag = "passage"): string {
  return `<${tag} id="${passage.order}" start="${formatTimestamp(passage.startSec)}" end="${formatTimestamp(passage.endSec)}">\n${escapeXmlText(passage.text)}\n</${tag}>`;
}

/** Appel complet : tout le transcript, vue d'ensemble + passages. */
export function buildFullSummaryPrompt(passages: SummaryPassage[]): string {
  return [
    `Summarize each of the ${passages.length} passages below, then write an overview of the whole recording.`,
    "",
    ...passages.map((passage) => passageXml(passage)),
  ].join("\n");
}

/**
 * Un sous-ensemble de passages (lot d'un audio long, ou rattrapage des
 * manquants). `context` : passages fournis pour comprendre, à ne pas résumer.
 * `previousSummary` : où en était l'enregistrement avant ce lot.
 */
export function buildPassagesPrompt({
  targets,
  context = [],
  previousSummary,
}: {
  targets: SummaryPassage[];
  context?: SummaryPassage[];
  previousSummary?: string;
}): string {
  const targetIds = targets.map((passage) => passage.order).join(", ");
  const all = [
    ...targets.map((p) => ({ p, target: true })),
    ...context.map((p) => ({ p, target: false })),
  ].sort((a, b) => a.p.order - b.p.order);
  return [
    `Summarize only the passages with these ids: ${targetIds}. Passages in <context> tags are there to help you understand; do not summarize them.`,
    ...(previousSummary
      ? [
          "",
          "What the recording covered before these passages:",
          previousSummary,
        ]
      : []),
    "",
    ...all.map(({ p, target }) =>
      passageXml(p, target ? "passage" : "context"),
    ),
  ].join("\n");
}

/** Audio long : vue d'ensemble à partir des résumés de passages. */
export function buildOverviewFromSummariesPrompt(
  passages: Array<PassageSummary & { startSec: number }>,
): string {
  return [
    "Here are the titles and summaries of the successive passages of an audio recording. Write an overview of the whole recording.",
    "",
    ...passages.map(
      (passage) =>
        `[${formatTimestamp(passage.startSec)}] ${escapeXmlText(passage.title)} — ${escapeXmlText(passage.summary)}`,
    ),
  ].join("\n");
}

function clean(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxChars
    ? `${normalized.slice(0, maxChars - 1).trimEnd()}…`
    : normalized;
}

/**
 * Rapproche la sortie du modèle des passages attendus, PAR `id` : un `id`
 * inconnu ou déjà vu est ignoré, un titre ou résumé vide aussi. Les passages
 * absents du résultat sont ceux à rattraper.
 */
export function matchPassageSummaries(
  expectedOrders: number[],
  output: Array<{ id: number; title: string; summary: string }>,
): Map<number, PassageSummary> {
  const expected = new Set(expectedOrders);
  const matched = new Map<number, PassageSummary>();
  for (const item of output) {
    if (!expected.has(item.id) || matched.has(item.id)) continue;
    const title = clean(
      item.title.replace(/^["'«“]+|["'»”]+$/g, ""),
      MAX_TITLE_CHARS,
    );
    const summary = clean(item.summary, MAX_SUMMARY_CHARS);
    if (!title || !summary) continue;
    matched.set(item.id, { order: item.id, title, summary });
  }
  return matched;
}

export function cleanOverview(overview: string): string | undefined {
  const trimmed = overview.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_OVERVIEW_CHARS
    ? `${trimmed.slice(0, MAX_OVERVIEW_CHARS - 1).trimEnd()}…`
    : trimmed;
}

/** Les passages manquants, et leurs voisins immédiats comme contexte. */
export function withNeighbours(
  passages: SummaryPassage[],
  missingOrders: number[],
): { targets: SummaryPassage[]; context: SummaryPassage[] } {
  const missing = new Set(missingOrders);
  const contextIndexes = new Set<number>();
  passages.forEach((passage, index) => {
    if (!missing.has(passage.order)) return;
    for (const neighbour of [index - 1, index + 1]) {
      const candidate = passages[neighbour];
      if (candidate && !missing.has(candidate.order)) {
        contextIndexes.add(neighbour);
      }
    }
  });
  return {
    targets: passages.filter((passage) => missing.has(passage.order)),
    context: [...contextIndexes]
      .sort((a, b) => a - b)
      .map((index) => passages[index]),
  };
}

/** Découpe en lots consécutifs de `batchSize` passages. */
export function splitIntoBatches<T>(items: T[], batchSize: number): T[][] {
  const size = Math.max(1, Math.floor(batchSize));
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}
