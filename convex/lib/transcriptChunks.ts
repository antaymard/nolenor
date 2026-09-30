import { stripLoneSurrogates } from "./textSanitize";

// Découpe d'un transcript horodaté en chunks de recherche, et relecture de ces
// chunks. Pur (sans `ctx`) : importable depuis l'action de transcription, les
// models et, plus tard, les formatters de l'agent.
//
// Contrat de stockage d'un chunk `transcript` :
//  - `text` : la prose de la tranche, segments joints par un espace, SANS
//    timestamps. C'est lui que voient l'index keyword, l'embedding et les
//    extraits de recherche.
//  - `metadata.segments` : l'index temporel, sans dupliquer le texte. `o` est
//    l'offset (en unités UTF-16, celles de `String.slice`) du début du segment
//    dans `text` ; le texte du segment i vaut `text.slice(o_i, o_{i+1}).trim()`.

/** Un segment tel que rendu par le fournisseur STT (`verbose_json`). */
export type RawTranscriptSegment = {
  start: number;
  end: number;
  text: string;
};

/** Un segment stocké : début, fin (secondes) et offset dans `text`. */
export type TranscriptSegmentIndex = {
  s: number;
  e: number;
  o: number;
};

export type TranscriptChunkDraft = {
  text: string;
  startSec: number;
  endSec: number;
  segments: TranscriptSegmentIndex[];
};

/** Metadata d'un chunk `transcript`, relue défensivement. */
export type TranscriptChunkMetadata = {
  sourceKey: string;
  model?: string;
  language?: string;
  durationSec?: number;
  startSec: number;
  endSec: number;
  segments: TranscriptSegmentIndex[];
  /**
   * Chapitres (ia/transcriptSummaryRun.ts), absents tant qu'ils n'ont pas
   * tourné. Leur découpage est libre, choisi par le modèle selon les sujets :
   * il ne suit pas celui des chunks, pensé pour la recherche.
   * `chapters` et `overview` : sur le chunk `order 0` seulement.
   */
  chapters?: TranscriptChapter[];
  /** Sur chaque chunk : les chapitres qu'il recouvre, pour la recherche. */
  chapterMarks?: TranscriptChapterMark[];
  /** Vue d'ensemble de tout l'audio : sur le chunk `order 0` seulement. */
  overview?: string;
  summaryModel?: string;
};

/** Un chapitre : de `s` à `e` (secondes), titré et résumé. */
export type TranscriptChapter = {
  s: number;
  e: number;
  title: string;
  summary: string;
};

/**
 * Le début et le titre d'un chapitre, recopiés sur chaque chunk qu'il
 * recouvre : un résultat de recherche nomme son chapitre sans relire le
 * chunk `order 0`. Le premier repère peut commencer avant le chunk.
 */
export type TranscriptChapterMark = { s: number; title: string };

/**
 * Bornes de découpe. ~120 s de parole ≈ 300 mots ≈ 400 tokens ≈ 1 800
 * caractères : assez court pour qu'un vecteur porte un sujet, assez long pour
 * qu'un passage se lise seul.
 *
 * - Une fin de phrase après `sentenceBreakAfterSec` ferme le chunk : les
 *   segments Whisper finissant presque toujours sur une phrase, les chunks
 *   tombent en pratique entre 115 et 150 s, ~2 min en moyenne.
 * - `maxSec` / `maxChars` coupent quoi qu'il arrive (monologue sans point,
 *   débit rapide). Un segment seul plus long que ces bornes reste entier : on
 *   ne coupe jamais à l'intérieur d'un segment, son timestamp serait faux.
 * - Une queue plus courte que `minTailSec` rejoint le chunk précédent, tant que
 *   le total reste sous `maxChars * 1.25`.
 */
export const TRANSCRIPT_CHUNK_LIMITS = {
  sentenceBreakAfterSec: 115,
  maxSec: 150,
  maxChars: 2_400,
  minTailSec: 30,
} as const;

type ChunkLimits = {
  sentenceBreakAfterSec: number;
  maxSec: number;
  maxChars: number;
  minTailSec: number;
};

type CleanSegment = RawTranscriptSegment;

const SENTENCE_END_RE = /[.!?…。！？]["'»”)\]]*$/;

/**
 * Normalisation appliquée AVANT le calcul des offsets : `buildChunkSnippets`
 * (searchableChunks.ts) replie `\s+` en un espace avant de rendre ses
 * `matchStart`. Un texte déjà replié garde donc des offsets alignés sur ceux
 * des extraits de recherche.
 */
export function normalizeSegmentText(text: string): string {
  return stripLoneSurrogates(text).replace(/\s+/g, " ").trim();
}

function cleanSegments(segments: RawTranscriptSegment[]): CleanSegment[] {
  const cleaned: CleanSegment[] = [];
  for (const segment of segments) {
    const text = normalizeSegmentText(
      typeof segment.text === "string" ? segment.text : "",
    );
    if (!text) continue;
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end)) {
      continue;
    }
    const start = Math.max(0, segment.start);
    // Un fournisseur peut rendre des bornes inversées ou un segment qui
    // recule : on garantit `s` croissant et `e >= s`, dont dépendent le
    // groupement et le seek.
    const previousStart = cleaned[cleaned.length - 1]?.start ?? 0;
    const safeStart = Math.max(start, previousStart);
    cleaned.push({
      start: safeStart,
      end: Math.max(segment.end, safeStart),
      text,
    });
  }
  return cleaned;
}

function joinSegments(group: CleanSegment[]): TranscriptChunkDraft {
  let text = "";
  const indexed: TranscriptSegmentIndex[] = [];
  for (const segment of group) {
    if (text.length > 0) text += " ";
    indexed.push({ s: segment.start, e: segment.end, o: text.length });
    text += segment.text;
  }
  return {
    text,
    startSec: group[0].start,
    endSec: group.reduce((max, segment) => Math.max(max, segment.end), 0),
    segments: indexed,
  };
}

function groupChars(group: CleanSegment[]): number {
  return group.reduce(
    (sum, segment, index) => sum + segment.text.length + (index > 0 ? 1 : 0),
    0,
  );
}

/**
 * Recolle les segments de plusieurs morceaux d'un même fichier (découpés par
 * le voice-server) en un seul flux horodaté depuis le début du fichier.
 *
 * Chaque morceau a ses timestamps relatifs à son propre début : on les décale
 * de son `startSec`. À la couture, un segment identique au précédent et qui
 * le suit à moins d'une seconde est un doublon (le STT a entendu deux fois la
 * même phrase de part et d'autre de la coupe) : il est écarté. Les segments
 * vides passent : `groupSegmentsIntoChunks` les nettoie de toute façon.
 */
export function mergeTranscriptParts(
  parts: Array<{ startSec: number; segments: RawTranscriptSegment[] }>,
): RawTranscriptSegment[] {
  const merged: RawTranscriptSegment[] = [];
  for (const part of parts) {
    const offset = Number.isFinite(part.startSec) ? part.startSec : 0;
    part.segments.forEach((segment, index) => {
      const shifted = {
        start: segment.start + offset,
        end: segment.end + offset,
        text: segment.text,
      };
      const previous = merged[merged.length - 1];
      if (
        index === 0 &&
        previous &&
        normalizeSegmentText(previous.text) ===
          normalizeSegmentText(shifted.text) &&
        Math.abs(shifted.start - previous.end) < 1
      ) {
        return;
      }
      merged.push(shifted);
    });
  }
  return merged;
}

/** Regroupe des segments STT en chunks d'environ deux minutes. */
export function groupSegmentsIntoChunks(
  segments: RawTranscriptSegment[],
  limits: ChunkLimits = TRANSCRIPT_CHUNK_LIMITS,
): TranscriptChunkDraft[] {
  const cleaned = cleanSegments(segments);
  if (cleaned.length === 0) return [];

  const groups: CleanSegment[][] = [];
  let current: CleanSegment[] = [];
  let currentChars = 0;

  for (const segment of cleaned) {
    if (current.length > 0) {
      const first = current[0];
      const last = current[current.length - 1];
      const elapsed = last.end - first.start;
      const breakOnSentence =
        elapsed >= limits.sentenceBreakAfterSec &&
        SENTENCE_END_RE.test(last.text);
      const exceedsDuration = segment.end - first.start > limits.maxSec;
      const exceedsChars =
        currentChars + 1 + segment.text.length > limits.maxChars;

      if (breakOnSentence || exceedsDuration || exceedsChars) {
        groups.push(current);
        current = [];
        currentChars = 0;
      }
    }
    currentChars += segment.text.length + (current.length > 0 ? 1 : 0);
    current.push(segment);
  }
  if (current.length > 0) groups.push(current);

  if (groups.length > 1) {
    const tail = groups[groups.length - 1];
    const tailDuration = tail[tail.length - 1].end - tail[0].start;
    const previous = groups[groups.length - 2];
    const mergedChars = groupChars(previous) + 1 + groupChars(tail);
    if (
      tailDuration < limits.minTailSec &&
      mergedChars <= limits.maxChars * 1.25
    ) {
      groups.splice(groups.length - 2, 2, [...previous, ...tail]);
    }
  }

  return groups.map(joinSegments);
}

/** Relit la metadata d'un chunk `transcript`, `null` si elle est inexploitable. */
export function parseTranscriptMetadata(
  metadata: unknown,
): TranscriptChunkMetadata | null {
  if (!metadata || typeof metadata !== "object") return null;
  const m = metadata as Record<string, unknown>;
  if (typeof m.sourceKey !== "string") return null;
  if (typeof m.startSec !== "number" || typeof m.endSec !== "number") {
    return null;
  }

  const segments = Array.isArray(m.segments)
    ? m.segments.flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const e = entry as Record<string, unknown>;
        if (
          typeof e.s !== "number" ||
          typeof e.e !== "number" ||
          typeof e.o !== "number"
        ) {
          return [];
        }
        return [{ s: e.s, e: e.e, o: e.o }];
      })
    : [];

  return {
    sourceKey: m.sourceKey,
    model: typeof m.model === "string" ? m.model : undefined,
    language: typeof m.language === "string" ? m.language : undefined,
    durationSec: typeof m.durationSec === "number" ? m.durationSec : undefined,
    startSec: m.startSec,
    endSec: m.endSec,
    segments,
    chapters: parseChapters(m.chapters),
    chapterMarks: parseChapterMarks(m.chapterMarks),
    overview: readNonEmptyString(m.overview),
    summaryModel: readNonEmptyString(m.summaryModel),
  };
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : undefined;
}

function parseChapters(value: unknown): TranscriptChapter[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const chapters = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const c = entry as Record<string, unknown>;
    const title = readNonEmptyString(c.title);
    const summary = readNonEmptyString(c.summary);
    if (typeof c.s !== "number" || typeof c.e !== "number") return [];
    if (!title || !summary) return [];
    return [{ s: c.s, e: c.e, title, summary }];
  });
  return chapters.length > 0 ? chapters : undefined;
}

function parseChapterMarks(
  value: unknown,
): TranscriptChapterMark[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const marks = value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const c = entry as Record<string, unknown>;
    const title = readNonEmptyString(c.title);
    if (typeof c.s !== "number" || !title) return [];
    return [{ s: c.s, title }];
  });
  return marks.length > 0 ? marks : undefined;
}

/** Les repères des chapitres qui recouvrent `[startSec, endSec)`. */
export function buildChapterMarks(
  chapters: TranscriptChapter[],
  range: { startSec: number; endSec: number },
): TranscriptChapterMark[] {
  const overlapping = chapters.filter(
    (chapter) => chapter.s < range.endSec && chapter.e > range.startSec,
  );
  // Chunk hors de toute plage (bornes arrondies) : le chapitre en cours.
  const current = chapters[findChapterIndexAt(chapters, range.startSec)];
  const marks =
    overlapping.length > 0 ? overlapping : current ? [current] : [];
  return marks.map((chapter) => ({ s: chapter.s, title: chapter.title }));
}

/**
 * Index du chapitre en cours à l'instant `sec` : le dernier qui commence
 * avant, ou le premier. -1 sans chapitres. Les chapitres sont triés.
 */
export function findChapterIndexAt(
  chapters: ReadonlyArray<{ s: number }>,
  sec: number,
): number {
  if (chapters.length === 0) return -1;
  let found = 0;
  for (let i = 0; i < chapters.length; i++) {
    if (chapters[i].s > sec) break;
    found = i;
  }
  return found;
}

/**
 * Titre du chapitre d'un chunk `transcript` : celui en cours à `atSec` (un
 * extrait de recherche), sinon celui qui couvre la plus grande part du chunk.
 */
export function getTranscriptChapterTitle(
  metadata: unknown,
  atSec?: number,
): string | undefined {
  const transcript = parseTranscriptMetadata(metadata);
  const marks = transcript?.chapterMarks;
  if (!transcript || !marks) return undefined;
  if (atSec !== undefined) {
    return marks[findChapterIndexAt(marks, atSec)]?.title;
  }
  let best: { title: string; covered: number } | undefined;
  marks.forEach((mark, index) => {
    const from = Math.max(mark.s, transcript.startSec);
    const to = Math.min(marks[index + 1]?.s ?? Infinity, transcript.endSec);
    const covered = to - from;
    if (!best || covered > best.covered) best = { title: mark.title, covered };
  });
  return best?.title;
}

/**
 * Clé R2 du fichier transcriptible d'un node (`values.audio.key`), `null` si
 * le node n'en porte pas. C'est elle que doivent porter ses chunks
 * `transcript` (`metadata.sourceKey`) pour rester valides.
 */
export function getTranscribableSourceKey(nodeData: {
  type: string;
  values: Record<string, unknown>;
}): string | null {
  if (nodeData.type !== "audio") return null;
  const audio = nodeData.values.audio as { key?: unknown } | null | undefined;
  return typeof audio?.key === "string" ? audio.key : null;
}

/** Clé du fichier transcrit, sans exiger une metadata complète. */
export function getTranscriptSourceKey(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const sourceKey = (metadata as { sourceKey?: unknown }).sourceKey;
  return typeof sourceKey === "string" ? sourceKey : undefined;
}

/** Découpe `text` aux offsets : un `{s, e, text}` par segment. */
export function splitTranscriptText(
  text: string,
  segments: TranscriptSegmentIndex[],
): Array<{ s: number; e: number; text: string }> {
  return segments.map((segment, index) => ({
    s: segment.s,
    e: segment.e,
    text: text
      .slice(segment.o, segments[index + 1]?.o ?? text.length)
      .trim(),
  }));
}

/**
 * Le segment qui contient l'offset `offset` de `text` (typiquement le
 * `matchStart` d'un extrait de recherche) : le dernier dont `o <= offset`.
 */
export function findSegmentAtOffset(
  segments: TranscriptSegmentIndex[],
  offset: number,
): TranscriptSegmentIndex | undefined {
  let found: TranscriptSegmentIndex | undefined;
  for (const segment of segments) {
    if (segment.o > offset) break;
    found = segment;
  }
  return found;
}
