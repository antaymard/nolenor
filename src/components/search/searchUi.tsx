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

/**
 * Highlights (case-insensitively) the terms in `text`.
 *
 * `terms` comes from the server, which parsed the query: splitting the raw
 * input here would highlight `-draft` or a quote character.
 */
export function HighlightedText({
  text,
  terms,
  className,
}: {
  text: string;
  terms: string[];
  className?: string;
}) {
  const parts = useMemo(() => {
    const usable = Array.from(
      new Set(terms.map((term) => term.trim()).filter((term) => term.length >= 2)),
    );
    if (usable.length === 0) return [text];
    const escaped = usable.map((term) =>
      term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    );
    const regex = new RegExp(`(${escaped.join("|")})`, "ig");
    return text.split(regex);
  }, [text, terms]);

  return (
    <span className={className}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark
            key={index}
            className="rounded-sm bg-yellow-200 px-0.5 text-yellow-950 dark:bg-yellow-400/30 dark:text-yellow-100"
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

/** An excerpt line with highlighting + page/type badge (hidden when compact). */
export function SearchSnippet({
  snippet,
  terms,
  compact = false,
}: {
  snippet: SearchSnippetType;
  terms: string[];
  compact?: boolean;
}) {
  const pageLabel =
    typeof snippet.page === "number" ? `Page ${snippet.page}` : snippet.chunkType;

  if (compact) {
    return (
      <HighlightedText
        text={snippet.snippet}
        terms={terms}
        className="line-clamp-2 text-xs text-muted-foreground"
      />
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <HighlightedText
        text={snippet.snippet}
        terms={terms}
        className="line-clamp-2 min-w-0 flex-1 overflow-hidden leading-snug text-muted-foreground"
      />
      <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
        {pageLabel}
      </span>
    </div>
  );
}

/** Horizontal strip of image previews (PDF/images). */
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
            alt="Preview"
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

/** Skeleton cards shown on the very first load. */
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

/** Empty state (no results / no nodes). */
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

/** Error state. */
export function SearchError({ message }: { message?: string }) {
  return (
    <div className="p-6 text-center text-sm text-destructive">
      An error occurred{message ? ` : ${message}` : ""}.
    </div>
  );
}
