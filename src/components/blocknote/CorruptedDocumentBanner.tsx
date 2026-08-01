import { TbAlertTriangle } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";

interface CorruptedDocumentBannerProps {
  onContinue: () => void;
}

/**
 * Shown in place of saving/editing when `createSafeBlockNoteEditor`
 * (safeCreateEditor.ts) had to drop the stored content because it crashed
 * ProseMirror's schema. The editor underneath is already a working empty
 * document — this banner exists purely to stop that empty document from being
 * saved over the original before the user has explicitly agreed to it,
 * since the original stays recoverable server-side (via `set_node_data`)
 * until the moment this is confirmed.
 */
export default function CorruptedDocumentBanner({
  onContinue,
}: CorruptedDocumentBannerProps) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/90 p-6">
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-center">
        <TbAlertTriangle className="size-6 text-amber-600" />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-stone-900">
            This document couldn't be loaded
          </span>
          <p className="text-sm text-stone-600">
            Its content is corrupted and couldn't be displayed. It can still be
            recovered from the server until you confirm, but continuing will
            permanently delete it.
          </p>
        </div>
        <Button size="sm" variant="destructive" onClick={onContinue}>
          Continue (delete corrupted content)
        </Button>
      </div>
    </div>
  );
}
