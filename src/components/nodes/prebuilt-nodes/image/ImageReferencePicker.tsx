import type { InputImageNode } from "@/hooks/useInputImageNodes";
import { Checkbox } from "@/components/shadcn/checkbox";
import { cn } from "@/lib/utils";

/**
 * Références jointes au prompt : TOUTES les images des nodes image branchés
 * en entrée, incluses silencieusement — sauf si l'utilisateur les bloque via
 * la checkbox (ou l'agent via `imageIncludeReferences`).
 *
 * Lecture seule : plus de sélection à la main, les vignettes montrent ce qui
 * partira, dans l'ordre des edges (l'ordre d'envoi côté serveur). Quand
 * l'inclusion est coupée, elles se grisent au lieu de disparaître — ce qui
 * est branché reste branché, c'est juste ignoré pour la prochaine génération.
 */
export default function ImageReferencePicker({
  inputNodes,
  includeReferences,
  attachedImageCount,
  onToggleInclude,
  maxReferenceImages,
  disabled,
}: {
  inputNodes: InputImageNode[];
  includeReferences: boolean;
  /** Total d'images jointes, calculé par l'appelant qui s'en sert aussi pour
   *  bloquer l'envoi — une seule source de vérité pour le plafond. */
  attachedImageCount: number;
  onToggleInclude: (include: boolean) => void;
  /** Plafond du modèle courant ; `0` = il n'accepte aucune référence. */
  maxReferenceImages: number;
  disabled?: boolean;
}) {
  // Rien de branché : pas de bloc vide dans le dialog, la fonctionnalité
  // n'existe simplement pas pour ce node tant qu'il n'a pas d'entrée.
  if (inputNodes.length === 0) return null;

  const supportsReferences = maxReferenceImages > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Reference images
        </span>
        {supportsReferences && includeReferences && (
          <span
            className={cn(
              "text-xs tabular-nums text-muted-foreground",
              attachedImageCount > maxReferenceImages && "text-destructive",
            )}
          >
            {attachedImageCount}/{maxReferenceImages}
          </span>
        )}
      </div>

      <div
        className={cn(
          "flex flex-wrap gap-2",
          (!supportsReferences || !includeReferences) &&
            "pointer-events-none opacity-40",
        )}
      >
        {inputNodes.map((node, index) => (
          <div
            key={node.nodeDataId}
            title={node.title}
            className="relative size-12 shrink-0 overflow-hidden rounded-md border border-transparent ring-1 ring-slate-200"
          >
            <img
              src={node.imageUrls[0]}
              alt={node.title}
              className="size-full object-cover"
              draggable={false}
            />

            <span className="absolute left-0 top-0 flex size-4 items-center justify-center rounded-br-md bg-primary text-[10px] font-semibold leading-none text-primary-foreground tabular-nums">
              {index + 1}
            </span>

            {node.imageUrls.length > 1 && (
              <span className="absolute bottom-0 right-0 rounded-tl-md bg-black/65 px-1 text-[10px] font-medium leading-4 text-white tabular-nums">
                &times;{node.imageUrls.length}
              </span>
            )}
          </div>
        ))}
      </div>

      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox
          checked={includeReferences}
          onCheckedChange={(checked) => onToggleInclude(checked === true)}
          disabled={disabled}
        />
        {supportsReferences
          ? "Use connected images as references"
          : "This model does not accept reference images."}
      </label>
    </div>
  );
}
