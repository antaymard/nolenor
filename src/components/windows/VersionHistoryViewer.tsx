import { useState } from "react";
import toast from "react-hot-toast";
import { useMutation } from "convex/react";
import type { Id } from "@/types";
import useRichQuery from "../utils/useRichQuery";
import { api } from "@/../convex/_generated/api";
import { TbRestore } from "react-icons/tb";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import { toastError } from "@/components/utils/errorUtils";
import { useNodeData } from "@/hooks/useNodeData";
import { VersionsList } from "./side-panel/VersionsList";
import { VersionContentPreview } from "./side-panel/VersionContentPreview";

export default function VersionHistoryViewer({
  nodeDataId,
  closeModale,
}: {
  nodeDataId: Id<"nodeDatas">;
  closeModale?: () => void;
}) {
  const { data, isSuccess, isPending } = useRichQuery(
    api.nodeDataVersions.listByNodeDataId,
    { nodeDataId },
  );
  const [selectedId, setSelectedId] = useState<Id<"nodeDataVersions"> | null>(
    null,
  );
  const restore = useMutation(api.nodeDataVersions.restore);
  const [isRestoring, setIsRestoring] = useState(false);
  // App node : seul le `code` est versionné et restauré, la donnée sauvegardée
  // par l'app ne bouge pas. Le dire ici, sinon un restore ressemble à une
  // remise à zéro de l'app.
  const isApp = useNodeData(nodeDataId)?.type === "app";

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

  const handleRestore = async () => {
    if (isRestoring) return;
    setIsRestoring(true);
    try {
      await restore({ versionId: selected });
      toast.success("Version restored.");
      closeModale?.();
    } catch (error) {
      toastError(error, "Error restoring version");
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 sm:flex-row">
      {/* Liste des versions */}
      <div className="flex max-h-40 shrink-0 flex-col gap-1 overflow-auto border-b pb-2 sm:max-h-none sm:w-56 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-2">
        <VersionsList
          versions={data}
          selectedId={selected}
          onSelect={setSelectedId}
        />
      </div>

      {/* Aperçu de la version sélectionnée */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border bg-white">
        <div className="flex shrink-0 items-center justify-end border-b px-2 py-1.5">
          <ConfirmableButton
            title="Restore this version"
            text={
              isApp
                ? "This restores the code of this version. The data your app has saved is left untouched. The current code is saved beforehand, so you can revert this at any time."
                : "This replaces the current content with this version. Your current state is saved beforehand, so you can revert this at any time."
            }
            confirmLabel="Restore"
            onConfirm={handleRestore}
          >
            <button
              type="button"
              disabled={isRestoring}
              className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              <TbRestore className="size-4" />
              {isRestoring ? "Restoring…" : "Restore"}
            </button>
          </ConfirmableButton>
        </div>
        <div className="min-h-0 flex-1">
          <VersionContentPreview versionId={selected} />
        </div>
      </div>
    </div>
  );
}
