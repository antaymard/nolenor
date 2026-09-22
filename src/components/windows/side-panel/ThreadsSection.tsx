import { TbMessage, TbExternalLink } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import useRichQuery from "@/components/utils/useRichQuery";
import { api } from "@/../convex/_generated/api";
import { formatDistanceToNow } from "@/lib/date-utils";
import { useOpenNoleThread } from "@/hooks/useOpenNoleThread";
import { isPendingDocId } from "@/lib/pendingDocIds";
import { SectionLabel } from "./SectionLabel";

/**
 * Nolë conversations that edited this node — a flat list (icon, title, date,
 * Open), not the wide master-detail layout `AssociatedThreadsViewer` uses:
 * that one is built for a dialog, and cramps badly in the panel's narrow
 * column.
 */
export function ThreadsSection({
  nodeDataId,
}: {
  nodeDataId: Id<"nodeDatas">;
}) {
  const openThread = useOpenNoleThread();
  const { data, isSuccess, isPending } = useRichQuery(
    api.nodeDataVersions.getThreadsThatCreatedVersions,
    // Cf. `VersionsTab` : rien à interroger tant que l'id est factice.
    isPendingDocId(nodeDataId) ? "skip" : { nodeDataId },
  );

  return (
    <div className="flex flex-col gap-1">
      <SectionLabel hint="Nolë conversations that created or edited this node.">
        Threads
      </SectionLabel>
      {isPending ? (
        <div className="px-2 py-3 text-sm text-slate-400">Loading…</div>
      ) : !isSuccess || data.length === 0 ? (
        <div className="px-2 py-3 text-sm text-slate-400">
          No Nolë conversation edited this node yet.
        </div>
      ) : (
        data.map((thread) => (
          <div
            key={thread._id}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent/50"
          >
            <TbMessage className="size-4 shrink-0 text-slate-500" />
            <span className="min-w-0 flex-1 truncate">
              {thread.title ?? "Untitled thread"}
            </span>
            <span
              className="shrink-0 text-xs text-slate-400"
              title={new Date(thread._creationTime).toLocaleString()}
            >
              {formatDistanceToNow(new Date(thread._creationTime), {
                addSuffix: true,
              })}
            </span>
            <button
              type="button"
              onClick={() => openThread(thread._id)}
              disabled={!thread.isOwner}
              title={
                thread.isOwner
                  ? "Open in the Nolë panel"
                  : "This thread belongs to another user"
              }
              className="flex shrink-0 items-center gap-1 rounded-lg px-1.5 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <TbExternalLink size={13} />
              Open
            </button>
          </div>
        ))
      )}
    </div>
  );
}
