import { formatTime } from "@/hooks/useMediaPlayback";
import {
  findPreparedMatch,
  memoizeSearchIndex,
  prepareSearchText,
} from "@/lib/searchMatch";
import type { SearchResult } from "@/components/windows/side-panel/SearchResultsList";

export type TranscriptSearchHit = SearchResult & { seconds: number };

/** Forme commune aux transcripts audio et vidéo (`getTranscript`). */
export type SearchableTranscript = {
  chunks: ReadonlyArray<{
    segments: ReadonlyArray<{ s: number; text: string }>;
  }>;
  chapters?: ReadonlyArray<{
    startSec: number;
    title: string;
    summary?: string;
  }>;
};

/** Plafond du nombre de résultats : un long enregistrement a des milliers de lignes. */
export const TRANSCRIPT_SEARCH_LIMIT = 200;

const getTranscriptSearchIndex = memoizeSearchIndex(
  (transcript: SearchableTranscript) => ({
    chapters: (transcript.chapters ?? []).map((chapter) => ({
      startSec: chapter.startSec,
      title: prepareSearchText(chapter.title),
      summary: chapter.summary ? prepareSearchText(chapter.summary) : null,
    })),
    segments: transcript.chunks.flatMap((chunk, chunkIndex) =>
      chunk.segments.map((segment, segmentIndex) => ({
        key: `line:${chunkIndex}:${segmentIndex}`,
        seconds: segment.s,
        prepared: prepareSearchText(segment.text),
      })),
    ),
  }),
);

/**
 * Chapitres (titre, sinon résumé) et lignes dont le texte contient `query`,
 * dans l'ordre du temps. Un chapitre se place devant ses propres lignes.
 */
export function searchTranscript(
  transcript: SearchableTranscript,
  query: string,
): TranscriptSearchHit[] {
  const index = getTranscriptSearchIndex(transcript);
  const hits: TranscriptSearchHit[] = [];
  index.chapters.forEach((chapter, chapterIndex) => {
    const title = findPreparedMatch(chapter.title, query);
    const summary =
      !title && chapter.summary
        ? findPreparedMatch(chapter.summary, query)
        : null;
    if (!title && !summary) return;
    hits.push({
      key: `chapter:${chapterIndex}`,
      seconds: chapter.startSec,
      label: formatTime(chapter.startSec),
      ...(title
        ? { text: chapter.title.text, ...title, emphasis: true }
        : { text: chapter.summary!.text, ...summary! }),
    });
  });
  for (const segment of index.segments) {
    const match = findPreparedMatch(segment.prepared, query);
    if (!match) continue;
    hits.push({
      key: segment.key,
      seconds: segment.seconds,
      label: formatTime(segment.seconds),
      text: segment.prepared.text,
      ...match,
    });
  }
  // `sort` est stable : à instant égal, le chapitre (poussé avant) reste devant.
  return hits
    .sort((a, b) => a.seconds - b.seconds)
    .slice(0, TRANSCRIPT_SEARCH_LIMIT);
}
