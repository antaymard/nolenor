import { Fragment, useMemo, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/shadcn/skeleton";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/shadcn/empty";
import type { SearchSnippet as SearchSnippetType } from "./useSearch";

/** Termes de la requête utilisables pour le surlignage (longueur >= 2). */
function highlightTerms(query: string): string[] {
  return Array.from(
    new Set(
      query
        .trim()
        .split(/\s+/)
        .map((term) => term.trim())
        .filter((term) => term.length >= 2),
    ),
  );
}

/** Surligne (insensible à la casse) tous les termes de la requête dans `text`. */
export function HighlightedText({
  text,
  query,
  className,
}: {
  text: string;
  query: string;
  className?: string;
}) {
  const parts = useMemo(() => {
    const terms = highlightTerms(query);
    if (terms.length === 0) return [text];
    const escaped = terms.map((term) =>
      term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    const regex = new RegExp(`(${escaped.join("|")})`, "ig");
    return text.split(regex);
  }, [text, query]);

  return (
    <span className={className}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark
            key={index}
            className="rounded-sm bg-highlight/30 px-0.5 text-inherit"
          >
            {part}
          </mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </span>
  );
}

/** Une ligne d'extrait avec surlignage + badge page/type (masqué en compact). */
export function SearchSnippet({
  snippet,
  query,
  compact = false,
}: {
  snippet: SearchSnippetType;
  query: string;
  compact?: boolean;
}) {
  const pageLabel =
    typeof snippet.page === "number" ? `Page ${snippet.page}` : snippet.chunkType;

  if (compact) {
    return (
      <HighlightedText
        text={snippet.snippet}
        query={query}
        className="line-clamp-2 text-xs text-muted-foreground"
      />
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <HighlightedText
        text={snippet.snippet}
        query={query}
        className="line-clamp-2 min-w-0 flex-1 overflow-hidden leading-snug text-muted-foreground"
      />
      <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
        {pageLabel}
      </span>
    </div>
  );
}

/** Bande horizontale d'aperçus d'images (PDF/images). */
export function PreviewImages({
  images,
  size = "h-28 w-28",
}: {
  images: Array<{ imageUrl: string; page?: number }>;
  size?: string;
}) {
  if (images.length === 0) return null;
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {images.map((image) => (
        <div key={image.imageUrl} className="relative shrink-0">
          <img
            src={image.imageUrl}
            alt="Aperçu"
            loading="lazy"
            className={cn("rounded-md border object-cover", size)}
          />
          {typeof image.page === "number" ? (
            <span className="absolute right-1 bottom-1 rounded-full bg-black/70 px-1.5 py-0.5 text-xs text-white">
              Page {image.page}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

/** Cartes-squelettes affichées au tout premier chargement. */
export function SearchSkeleton({
  count = 5,
  compact = false,
}: {
  count?: number;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col", compact ? "gap-1 p-2" : "gap-2 p-1")}>
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={cn(
            "flex flex-col gap-2 rounded",
            compact ? "p-2" : "p-3",
          )}
        >
          <Skeleton className={compact ? "h-4 w-1/3" : "h-5 w-1/2"} />
          <Skeleton className="h-3 w-full" />
          {!compact ? <Skeleton className="h-3 w-4/5" /> : null}
        </div>
      ))}
    </div>
  );
}

/** État vide (aucun résultat / aucun nœud). */
export function SearchEmpty({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
}) {
  return (
    <Empty className="h-full border-0">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description ? <EmptyDescription>{description}</EmptyDescription> : null}
      </EmptyHeader>
    </Empty>
  );
}

/** État d'erreur. */
export function SearchError({ message }: { message?: string }) {
  return (
    <div className="p-6 text-center text-sm text-destructive">
      Une erreur est survenue{message ? ` : ${message}` : ""}.
    </div>
  );
}
