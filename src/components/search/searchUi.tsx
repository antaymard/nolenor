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
import { formatTime } from "@/hooks/useMediaPlayback";
import type { SearchSnippet as SearchSnippetType } from "./useSearch";
import { TbChevronRight } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { formatRelative } from "./searchUtils";
import { useSearchBreadcrumb, type BreadcrumbCrumb } from "./searchBreadcrumb";

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
      new Set(
        terms.map((term) => term.trim()).filter((term) => term.length >= 2),
      ),
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
            className="rounded-md bg-yellow-200 px-0.5 text-yellow-950 dark:bg-yellow-400/30 dark:text-yellow-100"
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
  // Transcript excerpts carry the moment they were spoken at: "2:11" says
  // more than "transcript".
  const pageLabel =
    typeof snippet.startSec === "number"
      ? snippet.sectionTitle
        ? `${formatTime(snippet.startSec)} · ${snippet.sectionTitle}`
        : formatTime(snippet.startSec)
      : typeof snippet.page === "number"
        ? `Page ${snippet.page}`
        : snippet.chunkType;

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
      <span
        className="max-w-48 shrink-0 truncate rounded-md bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
        title={pageLabel}
      >
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
            className={cn("rounded-lg border object-cover", size)}
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
            "flex flex-col gap-2 rounded-xl",
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
        {description ? (
          <EmptyDescription>{description}</EmptyDescription>
        ) : null}
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

/** « Frame › H1 › H2 » : où se trouve le node sur le canvas. */
export function SearchBreadcrumb({
  crumbs,
  className,
}: {
  crumbs: BreadcrumbCrumb[];
  className?: string;
}) {
  if (crumbs.length === 0) return null;
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1 text-xs text-muted-foreground",
        className,
      )}
      title={crumbs.map((crumb) => crumb.label).join(" › ")}
    >
      {crumbs.map((crumb, index) => {
        const Icon = getNodeIcon(crumb.kind);
        const isLast = index === crumbs.length - 1;
        return (
          <Fragment key={crumb.nodeId}>
            {index > 0 ? (
              <TbChevronRight
                size={11}
                className="shrink-0 text-muted-foreground/60"
              />
            ) : null}
            <span
              className={cn(
                "flex min-w-0 items-center gap-1",
                // Le dernier crumb, le plus proche du node, garde la place.
                isLast ? "shrink" : "max-w-40 shrink-[2]",
              )}
            >
              {Icon ? <Icon size={11} className="shrink-0" /> : null}
              <span className="truncate">{crumb.label}</span>
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * L'en-tête commun à toutes les lignes de recherche, récents comme résultats :
 * icône, titre, fil d'Ariane, type et date de modification. Ce qui varie d'un
 * cas à l'autre (extraits, aperçus) vient en `children`, sous le titre.
 */
export function SearchRowHeader({
  nodeId,
  nodeDataId,
  nodeType,
  title,
  compact = false,
}: {
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  nodeType: string;
  /** Titre fourni par le serveur ; à défaut, celui du nodeData local. */
  title?: string;
  compact?: boolean;
}) {
  const localTitle = useNodeDataTitle(nodeDataId);
  const updatedAt = useNodeDataStore(
    (state) => state.nodeDatas.get(nodeDataId)?.updatedAt,
  );
  const crumbs = useSearchBreadcrumb(nodeId);
  const Icon = getNodeIcon(nodeType);
  const displayTitle = title || localTitle || nodeType;

  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground",
          compact ? "size-6" : "size-7",
        )}
        // Le type ne s'affiche plus en pastille : l'icône le porte.
        title={nodeType}
        aria-label={nodeType}
      >
        {Icon ? <Icon size={compact ? 13 : 15} /> : null}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "min-w-0 flex-1 truncate font-medium",
              compact ? "text-sm" : "text-[14px] leading-tight",
            )}
          >
            {displayTitle}
          </span>
          {updatedAt ? (
            <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
              {formatRelative(updatedAt)}
            </span>
          ) : null}
        </div>
        <SearchBreadcrumb crumbs={crumbs} />
      </div>
    </div>
  );
}

/** Titre de section de la liste (« Recent », « 12 results »). */
export function SearchSectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
      {children}
    </div>
  );
}
