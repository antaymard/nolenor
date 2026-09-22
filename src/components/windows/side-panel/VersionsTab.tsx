import useRichQuery from "@/components/utils/useRichQuery";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/types";
import { isPendingDocId } from "@/lib/pendingDocIds";
import { VersionsList } from "./VersionsList";

export function VersionsTab({
  nodeDataId,
  previewVersionId,
  onSelectVersion,
}: {
  nodeDataId: Id<"nodeDatas">;
  previewVersionId: Id<"nodeDataVersions"> | null;
  onSelectVersion: (versionId: Id<"nodeDataVersions">) => void;
}) {
  const { data, isSuccess, isPending } = useRichQuery(
    api.nodeDataVersions.listByNodeDataId,
    // Node pas encore confirmé côté serveur : pas d'id valide à interroger,
    // et donc pas encore d'historique. Cf. `pendingDocIds`.
    isPendingDocId(nodeDataId) ? "skip" : { nodeDataId },
  );

  if (isPending) {
    return <div className="p-3 text-sm text-slate-400">Loading…</div>;
  }
  if (!isSuccess) {
    return (
      <div className="p-3 text-sm text-slate-400">
        Error loading version history.
      </div>
    );
  }
  if (data.length === 0) {
    return (
      <div className="p-3 text-sm text-slate-400">
        No version history available.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 p-2">
      <VersionsList
        versions={data}
        selectedId={previewVersionId}
        onSelect={onSelectVersion}
      />
    </div>
  );
}
