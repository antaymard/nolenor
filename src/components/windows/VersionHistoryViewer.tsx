import { useState } from "react";
import type { Id } from "@/types";
import useRichQuery from "../utils/useRichQuery";
import { api } from "@/../convex/_generated/api";
import { formatDistanceToNow } from "@/lib/date-utils";
import { TbUser, TbRobot, TbSettings } from "react-icons/tb";
import { normalizeNodeId, type Value } from "platejs";
import { cn } from "@/lib/utils";
import DocumentStaticField from "@/components/fields/document-fields/DocumentStaticField";
import { TablePreview, type TableData } from "@/components/table";
import { parseStoredPlateDocument } from "@/../convex/lib/plateDocumentStorage";

const ACTOR_ICON = {
  user: TbUser,
  agent: TbRobot,
  system: TbSettings,
} as const;

const ACTOR_LABEL = {
  user: "User",
  agent: "Agent",
  system: "System",
} as const;

const TRIGGER_LABEL = {
  update: "Updated",
  delete: "Deleted",
  restore: "Restored",
} as const;

// Aperçu du snapshot d'une version. Les `values` (potentiellement volumineuses)
// ne sont rapatriées que pour la version sélectionnée.
function VersionContentPreview({
  versionId,
}: {
  versionId: Id<"nodeDataVersions">;
}) {
  const { data, isSuccess, isPending } = useRichQuery(
    api.nodeDataVersions.read,
    { versionId },
  );

  if (isPending) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-400">
        Loading…
      </div>
    );
  }

  if (!isSuccess || !data) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-slate-400">
        Preview unavailable.
      </div>
    );
  }

  switch (data.nodeType) {
    case "document": {
      const parsed = parseStoredPlateDocument(data.values.doc);
      if (!parsed || parsed.length === 0) {
        return (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Empty document.
          </div>
        );
      }
      const doc = normalizeNodeId(parsed as Value);
      return (
        <div className="h-full min-h-0 overflow-auto">
          <DocumentStaticField value={{ doc }} preview />
        </div>
      );
    }
    case "table": {
      const table = data.values.table as TableData | undefined;
      return (
        <div className="h-full min-h-0 overflow-auto">
          <TablePreview
            columns={table?.columns ?? []}
            rows={table?.rows ?? []}
          />
        </div>
      );
    }
    default:
      return (
        <div className="flex h-full items-center justify-center text-xs text-slate-400">
          No preview available for this type.
        </div>
      );
  }
}

export default function VersionHistoryViewer({
  nodeDataId,
}: {
  nodeDataId: Id<"nodeDatas">;
}) {
  const { data, isSuccess, isPending } = useRichQuery(
    api.nodeDataVersions.listByNodeDataId,
    { nodeDataId },
  );
  const [selectedId, setSelectedId] =
    useState<Id<"nodeDataVersions"> | null>(null);

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (!isSuccess) {
    return <div>Error loading version history.</div>;
  }

  if (data.length === 0) {
    return <div>No version history available.</div>;
  }

  // Sélection par défaut : la version la plus récente (data est trié desc).
  const selected = selectedId ?? data[0]._id;

  return (
    <div className="flex min-h-0 flex-1 gap-3">
      {/* Liste des versions */}
      <div className="flex w-56 shrink-0 flex-col gap-1 overflow-auto border-r pr-2">
        {data.map((version) => {
          const ActorIcon = ACTOR_ICON[version.actor.type];
          const isSelected = selected === version._id;

          return (
            <button
              key={version._id}
              type="button"
              onClick={() => setSelectedId(version._id)}
              className={cn(
                "flex items-center gap-2 rounded px-2 py-1.5 text-left text-sm",
                isSelected ? "bg-slate-100" : "hover:bg-slate-50",
              )}
            >
              <ActorIcon className="size-4 shrink-0 text-slate-500" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate">
                  {ACTOR_LABEL[version.actor.type]} ·{" "}
                  {TRIGGER_LABEL[version.trigger]}
                </span>
                <span
                  className="truncate text-xs text-slate-400"
                  title={new Date(version._creationTime).toLocaleString()}
                >
                  {formatDistanceToNow(new Date(version._creationTime), {
                    addSuffix: true,
                  })}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Aperçu de la version sélectionnée */}
      <div className="min-h-0 min-w-0 flex-1 rounded border bg-white">
        <VersionContentPreview versionId={selected} />
      </div>
    </div>
  );
}
