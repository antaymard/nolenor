import type { FunctionReturnType } from "convex/server";
import type { Id } from "@/types";
import type { api } from "@/../convex/_generated/api";
import { formatDistanceToNow } from "@/lib/date-utils";
import { TbUser, TbRobot, TbSettings } from "react-icons/tb";
import { cn } from "@/lib/utils";

export type VersionListItem = FunctionReturnType<
  typeof api.nodeDataVersions.listByNodeDataId
>[number];

export const ACTOR_ICON = {
  user: TbUser,
  agent: TbRobot,
  system: TbSettings,
} as const;

export const ACTOR_LABEL = {
  user: "User",
  agent: "Agent",
  system: "System",
} as const;

export const TRIGGER_LABEL = {
  update: "Updated",
  delete: "Deleted",
  restore: "Restored",
} as const;

/**
 * Liste des versions d'un nodeData, extraite de `VersionHistoryViewer` pour
 * être réutilisée par le panel latéral (sélection -> aperçu en place) sans
 * dupliquer le rendu.
 */
export function VersionsList({
  versions,
  selectedId,
  onSelect,
}: {
  versions: VersionListItem[];
  selectedId: Id<"nodeDataVersions"> | null;
  onSelect: (versionId: Id<"nodeDataVersions">) => void;
}) {
  return (
    <>
      {versions.map((version) => {
        const ActorIcon = ACTOR_ICON[version.actor.type];
        const isSelected = selectedId === version._id;

        return (
          <button
            key={version._id}
            type="button"
            onClick={() => onSelect(version._id)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm",
              isSelected ? "bg-accent" : "hover:bg-accent/50",
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
    </>
  );
}
