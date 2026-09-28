import { escapeXmlAttribute, escapeXmlText } from "../../lib/xml";

// Rendu du transcript d'un node audio pour `read_nodes`, sur le modèle de
// `pdfChunkFormatters.ts` : pur, sans `ctx`. Trois vues :
//  - full    : tout le transcript, ligne par ligne `[m:ss] texte`, tant qu'il
//              tient sous `MAX_TRANSCRIPT_FULL_CHARS` ;
//  - outline : au-delà, une ligne par passage (~2 min) pour s'orienter —
//              `titre — résumé` quand les résumés existent (cf.
//              ia/transcriptSummaryRun.ts), un aperçu du texte sinon ;
//  - range   : les segments d'une plage demandée (`mediaRanges`), plafonnés à
//              `MAX_TRANSCRIPT_CHARS_PER_CALL`.
// Les vues full et outline s'ouvrent sur la vue d'ensemble quand elle existe,
// et les vues full et range titrent chaque passage (`## [m:ss] titre`).

/** Transcript rendu en entier en dessous de ce seuil (≈ 10 min de parole). */
export const MAX_TRANSCRIPT_FULL_CHARS = 15_000;
/** Plafond d'une lecture par plage, aligné sur les PDF. */
export const MAX_TRANSCRIPT_CHARS_PER_CALL = 60_000;
const OUTLINE_PREVIEW_CHARS = 150;

export type ReadableTranscriptChunk = {
  order: number;
  startSec: number;
  endSec: number;
  passageTitle?: string;
  summary?: string;
  segments: Array<{ s: number; e: number; text: string }>;
};

export type ReadableTranscript = {
  language?: string;
  durationSec?: number;
  overview?: string;
  chunks: ReadableTranscriptChunk[];
};

/** État de transcription vu par l'agent. */
export type TranscriptReadStatus =
  | { kind: "complete"; transcript: ReadableTranscript }
  | { kind: "none" }
  | { kind: "running" }
  | { kind: "error"; error: string };

export const TRANSCRIPT_HINTS = {
  none: "This audio has not been transcribed. The user can transcribe it from the node toolbar (Transcribe button); you cannot start a transcription yourself.",
  running:
    "A transcription is in progress. Read this node again in a moment to get the transcript.",
  error: (error: string) =>
    `The last transcription failed: ${error}. The user can retry from the node toolbar.`,
  outline: (chunkCount: number) =>
    `Transcript too long to show in full: outline of ${chunkCount} passages (~2 min each). Read a passage with read_nodes mediaRanges=[{nodeId, startSec, endSec}] (up to ${MAX_TRANSCRIPT_CHARS_PER_CALL} characters per call).`,
  truncated: (nextStartSec: number) =>
    `Output truncated: call read_nodes again with mediaRanges startSec=${nextStartSec} to continue.`,
  emptyRange: (durationSec: number | undefined) =>
    `No transcript segment in this range${
      durationSec !== undefined
        ? ` (the audio lasts ${formatTimestamp(durationSec)})`
        : ""
    }.`,
  invalidRange: "mediaRanges endSec must be greater than startSec.",
  notAnAudio: "mediaRanges was provided for a non-audio node and was ignored.",
  notTranscribed:
    "mediaRanges was provided but this audio has no transcript yet.",
} as const;

/** `m:ss`, ou `h:mm:ss` à partir d'une heure. */
export function formatTimestamp(seconds: number): string {
  const total =
    Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}`
    : `${minutes}:${secs}`;
}

function segmentLine(segment: { s: number; text: string }): string {
  return `[${formatTimestamp(segment.s)}] ${escapeXmlText(segment.text)}`;
}

function passageHeader(chunk: ReadableTranscriptChunk): string | null {
  return chunk.passageTitle
    ? `## [${formatTimestamp(chunk.startSec)}] ${escapeXmlText(chunk.passageTitle)}`
    : null;
}

/** Les lignes d'un passage (titre éventuel, puis ses segments). */
function passageLines(
  chunk: ReadableTranscriptChunk,
  segments = chunk.segments,
): string[] {
  const header = passageHeader(chunk);
  return [...(header ? [header] : []), ...segments.map(segmentLine)];
}

function overviewBlock(transcript: ReadableTranscript): string[] {
  return transcript.overview
    ? [
        `<transcriptOverview>\n${escapeXmlText(transcript.overview)}\n</transcriptOverview>`,
      ]
    : [];
}

function outlineLine(chunk: ReadableTranscriptChunk): string {
  const range = `[${formatTimestamp(chunk.startSec)}–${formatTimestamp(chunk.endSec)}]`;
  if (chunk.passageTitle && chunk.summary) {
    return `${range} ${escapeXmlText(chunk.passageTitle)} — ${escapeXmlText(chunk.summary)}`;
  }
  const text = chunk.segments.map((segment) => segment.text).join(" ");
  const preview =
    text.length > OUTLINE_PREVIEW_CHARS
      ? `${text.slice(0, OUTLINE_PREVIEW_CHARS).trimEnd()}…`
      : text;
  return chunk.passageTitle
    ? `${range} ${escapeXmlText(chunk.passageTitle)} — ${escapeXmlText(preview)}`
    : `${range} ${escapeXmlText(preview)}`;
}

function transcriptOpenTag(
  transcript: ReadableTranscript,
  view: "full" | "outline" | "range",
  extra = "",
): string {
  const attributes = [
    transcript.language
      ? `language="${escapeXmlAttribute(transcript.language)}"`
      : "",
    transcript.durationSec !== undefined
      ? `durationSec="${Math.round(transcript.durationSec)}"`
      : "",
    `chunks="${transcript.chunks.length}"`,
    `view="${view}"`,
    extra,
  ].filter(Boolean);
  return `<transcript ${attributes.join(" ")}>`;
}

/** Vue par défaut : tout le transcript s'il est court, sinon un sommaire. */
export function buildTranscriptDefaultView(
  transcript: ReadableTranscript,
): string {
  const lines = transcript.chunks.flatMap((chunk) => passageLines(chunk));
  const totalChars = lines.reduce((sum, line) => sum + line.length + 1, 0);

  if (totalChars <= MAX_TRANSCRIPT_FULL_CHARS) {
    return [
      ...overviewBlock(transcript),
      transcriptOpenTag(transcript, "full"),
      ...lines,
      "</transcript>",
    ].join("\n");
  }

  return [
    ...overviewBlock(transcript),
    transcriptOpenTag(transcript, "outline"),
    ...transcript.chunks.map(outlineLine),
    "</transcript>",
    `<transcriptHint>${escapeXmlText(TRANSCRIPT_HINTS.outline(transcript.chunks.length))}</transcriptHint>`,
  ].join("\n");
}

function overlapsRange(
  segment: { s: number; e: number },
  range: { startSec: number; endSec: number },
): boolean {
  return segment.e > segment.s
    ? segment.s < range.endSec && segment.e > range.startSec
    : segment.s >= range.startSec && segment.s < range.endSec;
}

/**
 * Les segments qui chevauchent `[startSec, endSec)`, dans l'ordre, sous le
 * titre de leur passage. Plafonné à `MAX_TRANSCRIPT_CHARS_PER_CALL` : au-delà,
 * le hint donne l'instant d'où reprendre.
 */
export function buildTranscriptRangeView(
  transcript: ReadableTranscript,
  range: { startSec: number; endSec: number },
): string {
  if (!(range.endSec > range.startSec)) {
    return `<warning>${escapeXmlText(TRANSCRIPT_HINTS.invalidRange)}</warning>`;
  }

  const rangeAttribute = `from="${formatTimestamp(range.startSec)}" to="${formatTimestamp(range.endSec)}"`;
  const lines: string[] = [];
  let chars = 0;
  let segmentCount = 0;
  let nextStartSec: number | undefined;

  outer: for (const chunk of transcript.chunks) {
    const inRange = chunk.segments.filter((segment) =>
      overlapsRange(segment, range),
    );
    if (inRange.length === 0) continue;
    const header = passageHeader(chunk);
    let headerPending = header !== null;
    for (const segment of inRange) {
      const line = segmentLine(segment);
      const added =
        line.length + 1 + (headerPending && header ? header.length + 1 : 0);
      // Au moins une ligne, même trop longue : sinon l'agent bouclerait.
      if (segmentCount > 0 && chars + added > MAX_TRANSCRIPT_CHARS_PER_CALL) {
        nextStartSec = Math.floor(segment.s);
        break outer;
      }
      if (headerPending && header) {
        lines.push(header);
        headerPending = false;
      }
      lines.push(line);
      chars += added;
      segmentCount += 1;
    }
  }

  if (segmentCount === 0) {
    return [
      `${transcriptOpenTag(transcript, "range", rangeAttribute)}</transcript>`,
      `<transcriptHint>${escapeXmlText(TRANSCRIPT_HINTS.emptyRange(transcript.durationSec))}</transcriptHint>`,
    ].join("\n");
  }

  return [
    transcriptOpenTag(transcript, "range", rangeAttribute),
    ...lines,
    "</transcript>",
    ...(nextStartSec !== undefined
      ? [
          `<transcriptHint>${escapeXmlText(TRANSCRIPT_HINTS.truncated(nextStartSec))}</transcriptHint>`,
        ]
      : []),
  ].join("\n");
}

/** Corps transcript d'un node audio, selon son état et la plage demandée. */
export function buildTranscriptBody(
  status: TranscriptReadStatus,
  range?: { startSec: number; endSec: number },
): string {
  switch (status.kind) {
    case "none":
      return [
        ...(range
          ? [
              `<warning>${escapeXmlText(TRANSCRIPT_HINTS.notTranscribed)}</warning>`,
            ]
          : []),
        `<transcriptHint>${escapeXmlText(TRANSCRIPT_HINTS.none)}</transcriptHint>`,
      ].join("\n");
    case "running":
      return `<transcriptHint>${escapeXmlText(TRANSCRIPT_HINTS.running)}</transcriptHint>`;
    case "error":
      return `<transcriptHint>${escapeXmlText(TRANSCRIPT_HINTS.error(status.error))}</transcriptHint>`;
    case "complete":
      return range
        ? buildTranscriptRangeView(status.transcript, range)
        : buildTranscriptDefaultView(status.transcript);
  }
}
