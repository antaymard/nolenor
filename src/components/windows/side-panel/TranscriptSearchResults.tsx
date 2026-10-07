import { useMemo } from "react";
import {
  searchTranscript,
  TRANSCRIPT_SEARCH_LIMIT,
  type SearchableTranscript,
} from "@/lib/transcriptSearch";
import { useDebouncedSearchQuery } from "../WindowSearchContext";
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
  const debouncedQuery = useDebouncedSearchQuery(query);
  const hits = useMemo(
    () => searchTranscript(transcript, debouncedQuery),
    [transcript, debouncedQuery],
  );

  return (
    <SearchResultsList
      results={hits}
      query={debouncedQuery}
      onSelect={(hit) => onSeek(hit.seconds)}
      truncated={hits.length >= TRANSCRIPT_SEARCH_LIMIT}
      className={className}
    />
  );
}
