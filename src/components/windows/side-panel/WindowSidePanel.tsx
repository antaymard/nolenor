import { useEffect, useRef, useState, type ReactNode } from "react";
import { TbListDetails, TbLink, TbHistory, TbX } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/shadcn/tabs";
import { cn } from "@/lib/utils";
import { PlanTabPlaceholder } from "./PlanTabPlaceholder";
import { LinksTab } from "./LinksTab";
import { VersionsTab } from "./VersionsTab";

type SidePanelTab = "plan" | "links" | "versions";

/** Shown while a window body has not registered Plan-tab content. */
function defaultPlanTabContent(): ReactNode {
  return <PlanTabPlaceholder />;
}

/**
 * The window side panel's shell: three tabs (Plan / Links / Versions). Links
 * and Versions only mount (and only then query anything) once selected, via
 * Radix Tabs' default unmount-when-inactive — no manual "activated" tracking
 * needed.
 *
 * Purely presentational for layout: the caller (`WindowFrame`) decides
 * column-vs-overlay positioning via `className`.
 */
export function WindowSidePanel({
  nodeDataId,
  xyNodeId,
  canvasId,
  planTabContent,
  previewVersionId,
  onSelectVersion,
  searchQuery,
  onSearchQueryChange,
  searchFocusPending,
  onSearchFocusConsumed,
  className,
}: {
  nodeDataId: Id<"nodeDatas">;
  xyNodeId: string;
  canvasId: Id<"canvases"> | undefined;
  planTabContent: ReactNode | null;
  previewVersionId: Id<"nodeDataVersions"> | null;
  onSelectVersion: (versionId: Id<"nodeDataVersions">) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  /** `Mod+F` demandé : focus l'input (Plan) puis `onSearchFocusConsumed`. */
  searchFocusPending: boolean;
  onSearchFocusConsumed: () => void;
  className?: string;
}) {
  const [tab, setTab] = useState<SidePanelTab>("plan");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // `Mod+F` : revenir sur le Plan, puis focus l'input une fois monté (l'effet
  // se relance quand `tab` change, après le commit qui monte `TabsContent`).
  useEffect(() => {
    if (!searchFocusPending) return;
    if (tab !== "plan") {
      setTab("plan");
      return;
    }
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
    onSearchFocusConsumed();
  }, [searchFocusPending, tab, onSearchFocusConsumed]);

  return (
    <aside
      className={cn(
        "flex w-85 shrink-0 flex-col border-l bg-surface",
        className,
      )}
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as SidePanelTab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="shrink-0 p-2">
          <TabsList className="w-full">
            <TabsTrigger value="plan">
              <TbListDetails size={14} />
              Plan
            </TabsTrigger>
            <TabsTrigger value="links">
              <TbLink size={14} />
              Links
            </TabsTrigger>
            <TabsTrigger value="versions">
              <TbHistory size={14} />
              Versions
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="plan"
          className="flex min-h-0 flex-col overflow-auto"
        >
          <div className="sticky top-0 z-10 border-b bg-surface p-2">
            <div className="relative">
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => onSearchQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== "Escape") return;
                  // Un premier Échap vide, le suivant rend le focus.
                  if (searchQuery) onSearchQueryChange("");
                  else e.currentTarget.blur();
                  e.stopPropagation();
                }}
                placeholder="Search in this node"
                aria-label="Search in this node"
                className="w-full rounded-lg border bg-slate-50 py-1.5 pl-2 pr-7 text-sm text-slate-700 placeholder:text-slate-400"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => {
                    onSearchQueryChange("");
                    searchInputRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                >
                  <TbX size={12} />
                </button>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1">
            {planTabContent ?? defaultPlanTabContent()}
          </div>
        </TabsContent>

        <TabsContent value="links" className="min-h-0 flex-1 overflow-auto">
          {canvasId && (
            <LinksTab
              nodeDataId={nodeDataId}
              xyNodeId={xyNodeId}
              canvasId={canvasId}
            />
          )}
        </TabsContent>

        <TabsContent value="versions" className="min-h-0 flex-1 overflow-auto">
          <VersionsTab
            nodeDataId={nodeDataId}
            previewVersionId={previewVersionId}
            onSelectVersion={onSelectVersion}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
