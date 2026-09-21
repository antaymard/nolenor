import { useState, type ReactNode } from "react";
import { TbListDetails, TbLink, TbHistory } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import type { NodeType } from "@/types/domain/nodeTypes";
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

/**
 * Types with no window body to register Plan-tab content (no `AudioWindow`
 * yet) but which the search indexer already treats as "will eventually get a
 * transcript" (see `convex/searchable/chunkBuilder.ts`'s audio/video cases —
 * cheap filename-only indexing until real transcription lands). Falls back to
 * the same placeholder video's own window body registers, so the fallback
 * doesn't need to guess a message for a type it doesn't otherwise know.
 */
function defaultPlanTabContent(nodeType: NodeType): ReactNode {
  if (nodeType === "audio") {
    return <PlanTabPlaceholder message="Transcript support is coming soon." />;
  }
  return <PlanTabPlaceholder />;
}

/**
 * The window side panel's shell: three tabs (Plan / Links / Versions). Links
 * and Versions only mount (and only then query anything) once selected, via
 * Radix Tabs' default unmount-when-inactive — no manual "activated" tracking
 * needed.
 *
 * Purely presentational for layout: the caller (`WindowFrame` /
 * `FullscreenWindowFrame`) decides column-vs-overlay positioning via
 * `className`.
 */
export function WindowSidePanel({
  nodeDataId,
  xyNodeId,
  nodeType,
  canvasId,
  planTabContent,
  previewVersionId,
  onSelectVersion,
  className,
}: {
  nodeDataId: Id<"nodeDatas">;
  xyNodeId: string;
  nodeType: NodeType;
  canvasId: Id<"canvases"> | undefined;
  planTabContent: ReactNode | null;
  previewVersionId: Id<"nodeDataVersions"> | null;
  onSelectVersion: (versionId: Id<"nodeDataVersions">) => void;
  className?: string;
}) {
  const [tab, setTab] = useState<SidePanelTab>("plan");

  return (
    <aside className={cn("flex w-85 shrink-0 flex-col border-l bg-white", className)}>
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

        <TabsContent value="plan" className="flex min-h-0 flex-col overflow-auto">
          <div className="sticky top-0 z-10 border-b bg-white p-2">
            <input
              type="text"
              disabled
              placeholder="Search in this node"
              aria-label="Search in this node"
              className="w-full rounded-lg border bg-slate-50 px-2 py-1.5 text-sm text-slate-400 placeholder:text-slate-400"
            />
          </div>
          <div className="min-h-0 flex-1">
            {planTabContent ?? defaultPlanTabContent(nodeType)}
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
