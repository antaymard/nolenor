import { Fragment, useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";
import { Input } from "@/components/shadcn/input";
import { TbSearch } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { useDebounce } from "@/hooks/use-debounce";
import useRichQuery from "@/components/utils/useRichQuery";
import { useNodeDataTitle } from "@/hooks/useNodeTitle";
import { useWindowsStore } from "@/stores/windowsStore";
import { canNodeTypeBeOpenedInWindow } from "@/components/nodes/prebuilt-nodes/prebuiltNodesConfig";
import { getNodeIcon } from "@/components/utils/nodeDataDisplayUtils";
import type { NodeType } from "@/types/domain";
import { Spinner } from "@/components/shadcn/spinner";

interface MobileSearchSidebarProps {
  canvasId: Id<"canvases">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SearchResult = {
  type: string;
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  title?: string;
  images: Array<{ imageUrl: string; page?: number }>;
  snippets: Array<{
    snippet: string;
    chunkType: "node" | "page" | "annotation";
    order: number;
    page?: number;
    imageUrl?: string;
    matchStart: number;
    matchEnd: number;
  }>;
};

export default function MobileSearchSidebar({
  canvasId,
  open,
  onOpenChange,
}: MobileSearchSidebarProps) {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query.trim(), 300);

  const openWindow = useWindowsStore((state) => state.openWindow);

  const handleOpenNode = (params: {
    nodeId: string;
    nodeDataId: Id<"nodeDatas">;
    nodeType: NodeType | string;
  }) => {
    if (!canNodeTypeBeOpenedInWindow(params.nodeType)) return;
    openWindow({
      xyNodeId: params.nodeId,
      nodeDataId: params.nodeDataId,
      nodeType: params.nodeType as NodeType,
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[90vw] sm:max-w-md p-0">
        <SheetHeader className="border-b">
          <SheetTitle>Search</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col flex-1 min-h-0">
          <div className="flex items-center gap-2 px-3 py-2 border-b">
            <TbSearch className="text-muted-foreground" />
            <Input
              autoFocus
              type="text"
              placeholder="Search nodes..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-0 shadow-none focus-visible:ring-0 px-0"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {debouncedQuery ? (
              <SearchResults
                canvasId={canvasId}
                query={debouncedQuery}
                onOpen={handleOpenNode}
              />
            ) : (
              <RecentNodes canvasId={canvasId} onOpen={handleOpenNode} />
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RecentNodes({
  canvasId,
  onOpen,
}: {
  canvasId: Id<"canvases">;
  onOpen: (params: {
    nodeId: string;
    nodeDataId: Id<"nodeDatas">;
    nodeType: string;
  }) => void;
}) {
  const recents = useQuery(api.nodeDatas.listRecentByCanvasId, {
    canvasId,
    limit: 50,
  });

  if (!recents) {
    return (
      <div className="p-6 flex items-center justify-center text-muted-foreground">
        <Spinner className="size-4" />
      </div>
    );
  }

  if (recents.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No nodes yet
      </div>
    );
  }

  return (
    <div className="flex flex-col p-2">
      <h4 className="px-2 py-1 text-xs uppercase tracking-wider text-muted-foreground">
        Recent
      </h4>
      {recents.map((entry) => (
        <RecentRow
          key={entry.nodeData._id}
          nodeId={entry.xyNodeId}
          nodeDataId={entry.nodeData._id}
          nodeType={entry.nodeData.type}
          updatedAt={entry.nodeData.updatedAt}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function RecentRow({
  nodeId,
  nodeDataId,
  nodeType,
  updatedAt,
  onOpen,
}: {
  nodeId: string;
  nodeDataId: Id<"nodeDatas">;
  nodeType: string;
  updatedAt?: number;
  onOpen: (params: {
    nodeId: string;
    nodeDataId: Id<"nodeDatas">;
    nodeType: string;
  }) => void;
}) {
  const title = useNodeDataTitle(nodeDataId);
  const Icon = getNodeIcon(nodeType);
  const canOpen = canNodeTypeBeOpenedInWindow(nodeType);

  return (
    <button
      type="button"
      disabled={!canOpen}
      className={cn(
        "flex items-center gap-2 px-2 py-2 rounded-md text-left",
        canOpen ? "hover:bg-slate-100" : "opacity-50",
      )}
      onClick={() => onOpen({ nodeId, nodeDataId, nodeType })}
    >
      {Icon ? <Icon size={14} className="shrink-0 text-slate-500" /> : null}
      <span className="flex-1 min-w-0 truncate text-sm">
        {title || nodeType}
      </span>
      {updatedAt ? (
        <span className="text-[10px] text-muted-foreground shrink-0">
          {formatRelative(updatedAt)}
        </span>
      ) : null}
    </button>
  );
}

function SearchResults({
  canvasId,
  query,
  onOpen,
}: {
  canvasId: Id<"canvases">;
  query: string;
  onOpen: (params: {
    nodeId: string;
    nodeDataId: Id<"nodeDatas">;
    nodeType: string;
  }) => void;
}) {
  const {
    data: results,
    isPending,
    error,
  } = useRichQuery(api.searchableChunks.search, { query, canvasId });

  if (isPending) {
    return (
      <div className="p-6 flex items-center justify-center text-muted-foreground">
        <Spinner className="size-4" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6 text-sm text-red-500">Error: {error.message}</div>
    );
  }
  if (!results || results.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        No results
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      {results.map((r) => (
        <SearchResultCard
          key={r.nodeId}
          result={r}
          query={query}
          onClick={() =>
            onOpen({
              nodeId: r.nodeId,
              nodeDataId: r.nodeDataId,
              nodeType: r.type,
            })
          }
        />
      ))}
    </div>
  );
}

function SearchResultCard({
  result,
  query,
  onClick,
}: {
  result: SearchResult;
  query: string;
  onClick: () => void;
}) {
  const fallbackTitle = useNodeDataTitle(result.nodeDataId);
  const title = result.title ?? fallbackTitle;
  const Icon = getNodeIcon(result.type);
  const canOpen = canNodeTypeBeOpenedInWindow(result.type);
  const previewImages = useMemo(() => result.images, [result.images]);
  const sortedSnippets = useMemo(
    () =>
      [...result.snippets].sort((a, b) => {
        const pageA = a.page ?? Number.MAX_SAFE_INTEGER;
        const pageB = b.page ?? Number.MAX_SAFE_INTEGER;
        if (pageA !== pageB) return pageA - pageB;
        if (a.order !== b.order) return a.order - b.order;
        return a.matchStart - b.matchStart;
      }),
    [result.snippets],
  );

  return (
    <button
      type="button"
      disabled={!canOpen}
      onClick={onClick}
      className={cn(
        "flex flex-col text-left rounded-md p-2 gap-1",
        canOpen ? "hover:bg-slate-100" : "opacity-60",
      )}
    >
      <div className="flex items-center gap-2 min-w-0 w-full">
        {Icon ? <Icon size={14} className="shrink-0 text-slate-500" /> : null}
        <span className="font-medium text-sm truncate flex-1 min-w-0">
          {title || result.type}
        </span>
        <span className="text-[10px] text-muted-foreground bg-slate-100 px-1.5 rounded shrink-0">
          {result.type}
        </span>
      </div>
      {previewImages.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {previewImages.map((image) => (
            <div key={image.imageUrl} className="relative shrink-0">
              <img
                src={image.imageUrl}
                alt="Apercu"
                className="h-20 w-20 rounded-md object-cover border"
              />
              {typeof image.page === "number" ? (
                <span className="absolute right-1 bottom-1 text-[10px] text-white bg-black/70 px-1 py-0.5 rounded-full">
                  p.{image.page}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {sortedSnippets.slice(0, 2).map((s, i) => (
        <SnippetLine
          key={`${result.nodeId}-${i}`}
          snippet={s.snippet}
          query={query}
        />
      ))}
    </button>
  );
}

function SnippetLine({ snippet, query }: { snippet: string; query: string }) {
  const parts = useMemo(() => {
    const terms = Array.from(
      new Set(
        query
          .trim()
          .split(/\s+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 2),
      ),
    );
    if (terms.length === 0) return [snippet];
    const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const re = new RegExp(`(${escaped.join("|")})`, "ig");
    return snippet.split(re);
  }, [query, snippet]);

  return (
    <span className="text-xs text-muted-foreground line-clamp-2">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="bg-yellow-200 rounded-sm px-0.5">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  );
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(ts).toLocaleDateString();
}
