import { z } from "zod";
import { escapeXmlText } from "../../lib/xml";
import { formatTimestamp } from "./transcriptFormatters";

// Prompt et post-traitement des chapitres de transcript (titre + résumé par
// chapitre, vue d'ensemble). Pur, sans `ctx` : testable seul, et utilisé par
// ia/transcriptSummaryRun.ts.
//
// Les chapitres sont libres : c'est le modèle qui place les coupures, aux
// changements de sujet, indépendamment des chunks de recherche (~2 min).
// Pour que ces coupures tombent juste :
//  - le transcript lui est donné ligne par ligne (un segment STT par ligne),
//    chaque ligne numérotée ;
//  - il renvoie, pour chaque chapitre, le numéro de sa première ligne — un
//    entier qu'on valide, jamais un timestamp à interpréter ;
//  - la fin d'un chapitre est le début du suivant : pas de trou, pas de
//    chevauchement, par construction.

/** Une ligne du transcript : un segment STT, numéroté dans tout le fichier. */
export type TranscriptLine = {
  id: number;
  s: number;
  e: number;
  text: string;
};

/** Un chapitre tel que rendu par le modèle, validé : sa première ligne. */
export type ChapterDraft = {
  startLine: number;
  title: string;
  summary: string;
};

/** Un chapitre résolu en secondes, prêt à stocker. */
export type ResolvedChapter = {
  startSec: number;
  endSec: number;
  title: string;
  summary: string;
};

const MAX_TITLE_CHARS = 80;
const MAX_SUMMARY_CHARS = 700;
const MAX_OVERVIEW_CHARS = 2_000;
/** Un chapitre plus court est fondu dans le précédent. */
const MIN_CHAPTER_SEC = 20;
/** Longueur visée d'un chapitre, pour suggérer un nombre au modèle. */
const TYPICAL_CHAPTER_SEC = 7 * 60;
/** Garde-fou de stockage : la liste vit dans la metadata du chunk 0. */
const MAX_CHAPTERS = 200;

const chapterItem = z.object({
  startLine: z
    .number()
    .int()
    .describe(
      "The number of the line where this chapter starts (the N of its #N prefix).",
    ),
  title: z
    .string()
    .describe("A short title for this chapter: 3 to 8 words, no quotes."),
  summary: z
    .string()
    .describe(
      "1 to 4 sentences on what is said in this chapter: the points made, decisions, facts, names.",
    ),
});

/** Sortie d'un appel complet : vue d'ensemble + chapitres. */
export const fullChaptersSchema = z.object({
  overview: z
    .string()
    .describe(
      "5 to 10 lines giving an overview of the whole recording: what it is, who speaks, the main topics and conclusions, in order.",
    ),
  chapters: z.array(chapterItem),
});

/** Sortie d'un lot (audio long) : les chapitres seulement. */
export const chaptersOnlySchema = z.object({
  chapters: z.array(chapterItem),
});

/** Sortie de la vue d'ensemble construite à partir des chapitres. */
export const overviewOnlySchema = z.object({
  overview: fullChaptersSchema.shape.overview,
});

export const TRANSCRIPT_SUMMARY_SYSTEM = [
  "You split the transcript of an audio recording into chapters, so that a reader, or another AI agent, can get an overview of it and jump to a topic without reading everything.",
  'The transcript is given one line per spoken segment, each prefixed with "#N (m:ss)": N is the line number, m:ss the time it is said.',
  "A chapter starts where the conversation moves to a new topic, and lasts until the next chapter starts. Follow the content: a long discussion of one topic is one chapter, a quick aside is not a chapter of its own.",
  "Return the chapters in order. The first one starts at the first line. Give each its first line number, copied as is, a title and a summary.",
  "Each title and summary must describe only what is said in its own chapter.",
  "Be factual and specific: keep names, figures, dates and decisions. Do not invent anything that is not in the transcript.",
  "Write in the language of the transcript.",
].join("\n");

/** Les segments de tous les chunks, numérotés dans l'ordre. */
export function flattenTranscriptLines(
  chunks: Array<{ segments: Array<{ s: number; e: number; text: string }> }>,
): TranscriptLine[] {
  return chunks
    .flatMap((chunk) => chunk.segments)
    .filter((segment) => segment.text.trim().length > 0)
    .map((segment, id) => ({ id, ...segment }));
}

function lineText(line: TranscriptLine): string {
  return `#${line.id} (${formatTimestamp(line.s)}) ${escapeXmlText(line.text)}`;
}

/** Le nombre de chapitres suggéré au modèle : un repère, pas une consigne. */
export function suggestedChapterCount(lines: TranscriptLine[]): number {
  if (lines.length === 0) return 1;
  const duration = lines[lines.length - 1].e - lines[0].s;
  return Math.max(1, Math.round(duration / TYPICAL_CHAPTER_SEC));
}

function chapterCountHint(lines: TranscriptLine[]): string {
  const count = suggestedChapterCount(lines);
  return count === 1
    ? "This excerpt is short: one or two chapters are usually enough."
    : `As a rough guide, expect around ${count} chapters here; follow the topics rather than this number.`;
}

/** Appel complet : tout le transcript, vue d'ensemble + chapitres. */
export function buildFullChaptersPrompt(lines: TranscriptLine[]): string {
  return [
    "Split the transcript below into chapters, then write an overview of the whole recording.",
    chapterCountHint(lines),
    "",
    "<transcript>",
    ...lines.map(lineText),
    "</transcript>",
  ].join("\n");
}

/**
 * Un lot d'un audio long. `previousChapters` : les chapitres déjà faits, pour
 * que le modèle sache où en est l'enregistrement.
 */
export function buildBatchChaptersPrompt({
  lines,
  previousChapters,
}: {
  lines: TranscriptLine[];
  previousChapters: ResolvedChapter[];
}): string {
  const first = lines[0];
  return [
    `Split this part of the transcript (lines #${first.id} to #${lines[lines.length - 1].id}) into chapters. Its first chapter starts at line #${first.id}.`,
    chapterCountHint(lines),
    ...(previousChapters.length > 0
      ? [
          "",
          "The chapters of the recording before this part, for context only (do not return them):",
          ...previousChapters.map(
            (chapter) =>
              `[${formatTimestamp(chapter.startSec)}] ${escapeXmlText(chapter.title)}`,
          ),
        ]
      : []),
    "",
    "<transcript>",
    ...lines.map(lineText),
    "</transcript>",
  ].join("\n");
}

/** Audio long : vue d'ensemble à partir des chapitres. */
export function buildOverviewFromChaptersPrompt(
  chapters: ResolvedChapter[],
): string {
  return [
    "Here are the chapters of an audio recording, with their titles and summaries. Write an overview of the whole recording.",
    "",
    ...chapters.map(
      (chapter) =>
        `[${formatTimestamp(chapter.startSec)}] ${escapeXmlText(chapter.title)} — ${escapeXmlText(chapter.summary)}`,
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
 * Valide les chapitres rendus pour les lignes `lines` (un lot, ou tout le
 * fichier) : numéro hors du lot, déjà vu, titre ou résumé vide → ignoré ;
 * triés par première ligne ; le premier est ramené au début du lot, pour
 * que rien ne reste hors chapitre.
 */
export function validateChapterDrafts(
  lines: TranscriptLine[],
  output: Array<{ startLine: number; title: string; summary: string }>,
): ChapterDraft[] {
  if (lines.length === 0) return [];
  const firstId = lines[0].id;
  const lastId = lines[lines.length - 1].id;
  const seen = new Set<number>();
  const drafts: ChapterDraft[] = [];
  for (const item of output) {
    const startLine = item.startLine;
    if (!Number.isInteger(startLine)) continue;
    if (startLine < firstId || startLine > lastId || seen.has(startLine)) {
      continue;
    }
    const title = clean(
      item.title.replace(/^["'«“]+|["'»”]+$/g, ""),
      MAX_TITLE_CHARS,
    );
    const summary = clean(item.summary, MAX_SUMMARY_CHARS);
    if (!title || !summary) continue;
    seen.add(startLine);
    drafts.push({ startLine, title, summary });
  }
  drafts.sort((a, b) => a.startLine - b.startLine);
  if (drafts.length > 0) drafts[0] = { ...drafts[0], startLine: firstId };
  return drafts;
}

/**
 * Passe des premières lignes aux secondes. Chaque chapitre finit où commence
 * le suivant ; le premier commence à 0, le dernier finit à `durationSec`.
 * Un chapitre de moins de `MIN_CHAPTER_SEC` est fondu dans le précédent.
 */
export function resolveChapters(
  lines: TranscriptLine[],
  drafts: ChapterDraft[],
  durationSec: number | undefined,
): ResolvedChapter[] {
  if (lines.length === 0 || drafts.length === 0) return [];
  const startById = new Map(lines.map((line) => [line.id, line.s]));
  const lastEnd = lines[lines.length - 1].e;
  const end = Math.max(durationSec ?? 0, lastEnd);

  const starts = drafts
    .map((draft) => ({ draft, startSec: startById.get(draft.startLine) }))
    .filter(
      (entry): entry is { draft: ChapterDraft; startSec: number } =>
        entry.startSec !== undefined,
    );
  if (starts.length === 0) return [];
  starts[0] = { ...starts[0], startSec: 0 };

  const kept: Array<{ draft: ChapterDraft; startSec: number }> = [];
  starts.forEach((entry, index) => {
    const nextStart = starts[index + 1]?.startSec ?? end;
    const tooShort = nextStart - entry.startSec < MIN_CHAPTER_SEC;
    if (kept.length > 0 && tooShort) return;
    // Même instant que le précédent (segments de même début) : fondu aussi.
    const previous = kept[kept.length - 1];
    if (previous && entry.startSec <= previous.startSec) return;
    kept.push(entry);
  });

  return kept.slice(0, MAX_CHAPTERS).map((entry, index, list) => ({
    startSec: entry.startSec,
    endSec: index + 1 < list.length ? list[index + 1].startSec : end,
    title: entry.draft.title,
    summary: entry.draft.summary,
  }));
}

export function cleanOverview(overview: string): string | undefined {
  const trimmed = overview.trim();
  if (!trimmed) return undefined;
  return trimmed.length > MAX_OVERVIEW_CHARS
    ? `${trimmed.slice(0, MAX_OVERVIEW_CHARS - 1).trimEnd()}…`
    : trimmed;
}

/**
 * Premier lot de lignes à partir de `from`, sous `maxChars` caractères de
 * prompt (au moins une ligne). Renvoie l'index de fin, exclusif.
 */
export function takeBatch(
  lines: TranscriptLine[],
  from: number,
  maxChars: number,
): number {
  let chars = 0;
  let to = from;
  while (to < lines.length) {
    const next = lineText(lines[to]).length + 1;
    if (to > from && chars + next > maxChars) break;
    chars += next;
    to += 1;
  }
  return to;
}

/**
 * Chapitrage d'un audio long, lot par lot. Le dernier chapitre d'un lot reste
 * ouvert : le lot suivant repart de son début et peut le prolonger, pour ne
 * pas couper un sujet à la frontière. Sauf s'il occupe plus de la moitié du
 * lot : on n'avancerait presque plus, on le ferme à la frontière.
 *
 * `chapterBatch` rend les chapitres validés d'un lot (au moins un), avec en
 * contexte ceux déjà retenus. Les `id` des lignes sont leurs index.
 */
export async function collectBatchedChapterDrafts(
  lines: TranscriptLine[],
  maxChars: number,
  chapterBatch: (
    batch: TranscriptLine[],
    previousChapters: ResolvedChapter[],
  ) => Promise<ChapterDraft[]>,
): Promise<ChapterDraft[]> {
  const drafts: ChapterDraft[] = [];
  let from = 0;
  while (from < lines.length) {
    const to = takeBatch(lines, from, maxChars);
    const batch = lines.slice(from, to);
    const batchDrafts = await chapterBatch(
      batch,
      resolveChapters(lines.slice(0, from), drafts, undefined),
    );
    const open = batchDrafts[batchDrafts.length - 1];
    const carryOver =
      to < lines.length &&
      batchDrafts.length > 1 &&
      open.startLine > from &&
      to - open.startLine <= (to - from) / 2;
    if (carryOver) {
      drafts.push(...batchDrafts.slice(0, -1));
      from = open.startLine;
    } else {
      drafts.push(...batchDrafts);
      from = to;
    }
  }
  return drafts;
}

/** Taille du prompt d'un transcript entier, en caractères. */
export function transcriptPromptChars(lines: TranscriptLine[]): number {
  return lines.reduce((sum, line) => sum + lineText(line).length + 1, 0);
}
