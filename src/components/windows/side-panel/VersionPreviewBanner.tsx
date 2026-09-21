import { TbRestore } from "react-icons/tb";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import { formatDistanceToNow } from "@/lib/date-utils";
import { ACTOR_LABEL, type VersionListItem } from "./VersionsList";

/**
 * Banner shown above the window body while a version is being previewed
 * in-place (no separate dialog): the body itself turns yellow and renders
 * `VersionContentPreview` instead of the live editor.
 */
export function VersionPreviewBanner({
  version,
  isApp,
  isRestoring,
  onCancel,
  onRestore,
}: {
  version: VersionListItem;
  isApp: boolean;
  isRestoring: boolean;
  onCancel: () => void;
  onRestore: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-yellow-200 bg-yellow-100 px-3 py-2 text-sm text-yellow-900">
      <span className="truncate">
        Preview version —{" "}
        {formatDistanceToNow(new Date(version._creationTime), {
          addSuffix: true,
        })}{" "}
        — {ACTOR_LABEL[version.actor.type]}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2 py-1 text-yellow-800 hover:bg-yellow-200/60"
        >
          Cancel
        </button>
        <ConfirmableButton
          title="Restore this version"
          text={
            isApp
              ? "This restores the code of this version. The data your app has saved is left untouched. The current code is saved beforehand, so you can revert this at any time."
              : "This replaces the current content with this version. Your current state is saved beforehand, so you can revert this at any time."
          }
          confirmLabel="Restore"
          onConfirm={onRestore}
        >
          <button
            type="button"
            disabled={isRestoring}
            className="flex items-center gap-1.5 rounded-lg bg-yellow-900/10 px-2 py-1 font-medium text-yellow-900 hover:bg-yellow-900/20 disabled:opacity-50"
          >
            <TbRestore className="size-4" />
            {isRestoring ? "Restoring…" : "Restore"}
          </button>
        </ConfirmableButton>
      </div>
    </div>
  );
}
