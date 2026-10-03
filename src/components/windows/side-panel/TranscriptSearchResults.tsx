import { useDeferredValue, useMemo } from "react";
import {
  searchTranscript,
  TRANSCRIPT_SEARCH_LIMIT,
  type SearchableTranscript,
} from "@/lib/transcriptSearch";
import { SearchResultsList } from "./SearchResultsList";

/**
 * Recherche dans un transcript audio ou vidéo : un clic sur un résultat joue
 * l'enregistrement à partir de cet instant.
 */
export function TranscriptSearchResults({
  transcript,
  query,
  onSeek,
  className,
}: {
  transcript: SearchableTranscript;
  query: string;
  onSeek: (seconds: number) => void;
  className?: string;
}) {
  const deferredQuery = useDeferredValue(query);
  const hits = useMemo(
    () => searchTranscript(transcript, deferredQuery),
    [transcript, deferredQuery],
  );

  return (
    <SearchResultsList
      results={hits}
      query={query}
      onSelect={(hit) => onSeek(hit.seconds)}
      truncated={hits.length >= TRANSCRIPT_SEARCH_LIMIT}
      className={className}
    />
  );
}
