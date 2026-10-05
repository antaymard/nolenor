import { formatTime } from "@/hooks/useMediaPlayback";
import { findSearchMatch } from "@/lib/searchMatch";
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

/**
 * Chapitres (titre, sinon résumé) et lignes dont le texte contient `query`,
 * dans l'ordre du temps. Un chapitre se place devant ses propres lignes.
 */
export function searchTranscript(
  transcript: SearchableTranscript,
  query: string,
): TranscriptSearchHit[] {
  const hits: TranscriptSearchHit[] = [];
  (transcript.chapters ?? []).forEach((chapter, index) => {
    const title = findSearchMatch(chapter.title, query);
    const summary =
      !title && chapter.summary
        ? findSearchMatch(chapter.summary, query)
        : null;
    if (!title && !summary) return;
    hits.push({
      key: `chapter:${index}`,
      seconds: chapter.startSec,
      label: formatTime(chapter.startSec),
      ...(title
        ? { text: chapter.title, ...title, emphasis: true }
        : { text: chapter.summary ?? "", ...summary! }),
    });
  });
  transcript.chunks.forEach((chunk, chunkIndex) => {
    chunk.segments.forEach((segment, segmentIndex) => {
      const match = findSearchMatch(segment.text, query);
      if (!match) return;
      hits.push({
        key: `line:${chunkIndex}:${segmentIndex}`,
        seconds: segment.s,
        label: formatTime(segment.s),
        text: segment.text,
        ...match,
      });
    });
  });
  // `sort` est stable : à instant égal, le chapitre (poussé avant) reste devant.
  return hits
    .sort((a, b) => a.seconds - b.seconds)
    .slice(0, TRANSCRIPT_SEARCH_LIMIT);
}
