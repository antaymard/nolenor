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
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-center shadow-lg">
        <TbAlertTriangle className="size-6 text-amber-600" />
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-stone-900">
            Ce document n'a pas pu être chargé
          </span>
          <p className="text-sm text-stone-600">
            Son contenu est corrompu et n'a pas pu être affiché. Il reste
            récupérable côté serveur tant que vous n'avez pas confirmé, mais
            continuer l'effacera définitivement.
          </p>
        </div>
        <Button size="sm" variant="destructive" onClick={onContinue}>
          Continuer (efface le contenu corrompu)
        </Button>
      </div>
    </div>
  );
}
