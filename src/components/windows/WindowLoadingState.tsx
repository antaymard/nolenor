import { Spinner } from "@/components/shadcn/spinner";

/**
 * L'attente d'un nodeData, dans le corps d'une window.
 *
 * Deux cas, tous deux transitoires et tous deux résolus sans action de
 * l'utilisateur : la création local-first n'est pas encore confirmée (le
 * `nodeDataId` de la window est un id factice `pending_…`, cf.
 * `pendingDocIds`), ou le doc n'est pas encore dans le `nodeDataStore`.
 *
 * Avant, chaque body rendait `null` dans ces cas-là : une fenêtre vide et
 * muette, qu'il fallait fermer et rouvrir pour obtenir un éditeur. Un
 * spinner dit que ça arrive — et ça arrive vraiment, le contenu se montant
 * de lui-même au re-render suivant.
 */
export default function WindowLoadingState({
  label = "Loading",
}: {
  label?: string;
}) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner className="size-4" />
        {label}
      </span>
    </div>
  );
}
