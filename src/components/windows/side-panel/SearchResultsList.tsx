import { cn } from "@/lib/utils";

/** Contexte gardé de part et d'autre du match dans un extrait. */
const SNIPPET_BEFORE = 30;
const SNIPPET_AFTER = 80;

export type SearchResult = {
  key: string;
  text: string;
  /** Bornes du match dans `text`. */
  start: number;
  end: number;
  /** Repère affiché devant l'extrait (« p. 3 », « 1:23 »…). */
  label?: string;
  /** Rendu appuyé, pour un titre. */
  emphasis?: boolean;
};

/**
 * Résultats d'une recherche du panel latéral, quel que soit le type de node :
 * un compteur, puis un extrait par résultat avec le match surligné. Le body
 * de la window décide de ce que fait un clic (scroll, seek…).
 */
export function SearchResultsList<T extends SearchResult>({
  results,
  query,
  onSelect,
  truncated = false,
  className,
}: {
  results: T[];
  query: string;
  onSelect: (result: T) => void;
  /** La recherche s'est arrêtée à une limite : le compte est un minimum. */
  truncated?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden", className)}>
      <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        {results.length === 0
          ? "No results"
          : `${results.length}${truncated ? "+" : ""} result${results.length > 1 ? "s" : ""}`}
      </div>
      <div className="flex-1 overflow-auto p-2">
        {results.length === 0 ? (
          <div className="px-2 py-4 text-sm text-slate-400">
            Nothing matches “{query}”.
          </div>
        ) : (
          <ul className="space-y-0.5">
            {results.map((result) => (
              <li key={result.key}>
                <button
                  type="button"
                  onClick={() => onSelect(result)}
                  className={cn(
                    "flex w-full gap-2 rounded px-2 py-1 text-left text-sm leading-snug text-slate-600 transition-colors hover:bg-slate-200 hover:text-slate-900",
                    result.emphasis && "font-semibold text-slate-700",
                  )}
                >
                  {result.label && (
                    <span className="shrink-0 pt-px font-mono text-xs font-normal tabular-nums text-slate-400">
                      {result.label}
                    </span>
                  )}
                  <Snippet result={result} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Snippet({ result }: { result: SearchResult }) {
  const { text, start, end } = result;
  const from = Math.max(0, start - SNIPPET_BEFORE);
  const to = Math.min(text.length, end + SNIPPET_AFTER);
  return (
    <span className="line-clamp-3 min-w-0 flex-1">
      {from > 0 && "…"}
      {text.slice(from, start)}
      <mark className="rounded-sm bg-yellow-200 text-slate-900">
        {text.slice(start, end)}
      </mark>
      {text.slice(end, to)}
      {to < text.length && "…"}
    </span>
  );
}
