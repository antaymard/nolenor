import { escapeXmlAttribute, escapeXmlText } from "../../lib/xml";

// Rendu du transcript d'un node audio pour `read_nodes`, sur le modèle de
// `pdfChunkFormatters.ts` : pur, sans `ctx`. Trois vues :
//  - full    : tout le transcript, ligne par ligne `[m:ss] texte`, tant qu'il
//              tient sous `MAX_TRANSCRIPT_FULL_CHARS` ;
//  - outline : au-delà, une ligne par chunk (~2 min) pour s'orienter ;
//  - range   : les segments d'une plage demandée (`mediaRanges`), plafonnés à
//              `MAX_TRANSCRIPT_CHARS_PER_CALL`.

/** Transcript rendu en entier en dessous de ce seuil (≈ 10 min de parole). */
export const MAX_TRANSCRIPT_FULL_CHARS = 15_000;
/** Plafond d'une lecture par plage, aligné sur les PDF. */
export const MAX_TRANSCRIPT_CHARS_PER_CALL = 60_000;
const OUTLINE_PREVIEW_CHARS = 150;

export type ReadableTranscriptChunk = {
  order: number;
  startSec: number;
  endSec: number;
  segments: Array<{ s: number; e: number; text: string }>;
};

export type ReadableTranscript = {
  language?: string;
  durationSec?: number;
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

function allSegments(transcript: ReadableTranscript) {
  return transcript.chunks.flatMap((chunk) => chunk.segments);
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
  const lines = allSegments(transcript).map(segmentLine);
  const totalChars = lines.reduce((sum, line) => sum + line.length + 1, 0);

  if (totalChars <= MAX_TRANSCRIPT_FULL_CHARS) {
    return `${transcriptOpenTag(transcript, "full")}\n${lines.join("\n")}\n</transcript>`;
  }

  const outline = transcript.chunks.map((chunk) => {
    const text = chunk.segments.map((segment) => segment.text).join(" ");
    const preview =
      text.length > OUTLINE_PREVIEW_CHARS
        ? `${text.slice(0, OUTLINE_PREVIEW_CHARS).trimEnd()}…`
        : text;
    return `[${formatTimestamp(chunk.startSec)}–${formatTimestamp(chunk.endSec)}] ${escapeXmlText(preview)}`;
  });
  return [
    `${transcriptOpenTag(transcript, "outline")}`,
    ...outline,
    "</transcript>",
    `<transcriptHint>${escapeXmlText(TRANSCRIPT_HINTS.outline(transcript.chunks.length))}</transcriptHint>`,
  ].join("\n");
}

/**
 * Les segments qui chevauchent `[startSec, endSec)`, dans l'ordre. Plafonné
 * à `MAX_TRANSCRIPT_CHARS_PER_CALL` : au-delà, le hint donne l'instant d'où
 * reprendre.
 */
export function buildTranscriptRangeView(
  transcript: ReadableTranscript,
  range: { startSec: number; endSec: number },
): string {
  if (!(range.endSec > range.startSec)) {
    return `<warning>${escapeXmlText(TRANSCRIPT_HINTS.invalidRange)}</warning>`;
  }

  const inRange = allSegments(transcript).filter((segment) =>
    segment.e > segment.s
      ? segment.s < range.endSec && segment.e > range.startSec
      : segment.s >= range.startSec && segment.s < range.endSec,
  );
  const rangeAttribute = `from="${formatTimestamp(range.startSec)}" to="${formatTimestamp(range.endSec)}"`;

  if (inRange.length === 0) {
    return [
      `${transcriptOpenTag(transcript, "range", rangeAttribute)}</transcript>`,
      `<transcriptHint>${escapeXmlText(TRANSCRIPT_HINTS.emptyRange(transcript.durationSec))}</transcriptHint>`,
    ].join("\n");
  }

  const lines: string[] = [];
  let chars = 0;
  let nextStartSec: number | undefined;
  for (const segment of inRange) {
    const line = segmentLine(segment);
    // Au moins une ligne, même trop longue : sinon l'agent bouclerait.
    if (
      lines.length > 0 &&
      chars + line.length + 1 > MAX_TRANSCRIPT_CHARS_PER_CALL
    ) {
      nextStartSec = Math.floor(segment.s);
      break;
    }
    lines.push(line);
    chars += line.length + 1;
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
