import type { Id } from "@/types";
import useRichQuery from "../utils/useRichQuery";
import { api } from "@/../convex/_generated/api";
import { formatDistanceToNow } from "@/lib/date-utils";
import { TbUser, TbRobot, TbSettings } from "react-icons/tb";

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

export default function VersionHistoryViewer({
  nodeDataId,
}: {
  nodeDataId: Id<"nodeDatas">;
}) {
  const { data, isSuccess, isPending } = useRichQuery(
    api.nodeDataVersions.listByNodeDataId,
    { nodeDataId },
  );

  if (isPending) {
    return <div>Loading...</div>;
  }

  if (!isSuccess) {
    return <div>Error loading version history.</div>;
  }

  if (data.length === 0) {
    return <div>No version history available.</div>;
  }

  return (
    <div className="flex flex-col gap-1">
      {data.map((version) => {
        const ActorIcon = ACTOR_ICON[version.actor.type];

        return (
          <div
            key={version._id}
            className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
          >
            <ActorIcon className="size-4 shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1 truncate">
              {ACTOR_LABEL[version.actor.type]} ·{" "}
              {TRIGGER_LABEL[version.trigger]}
            </span>
            <span
              className="shrink-0 text-xs text-slate-400"
              title={new Date(version._creationTime).toLocaleString()}
            >
              {formatDistanceToNow(new Date(version._creationTime), {
                addSuffix: true,
              })}
            </span>
          </div>
        );
      })}
    </div>
  );
}
