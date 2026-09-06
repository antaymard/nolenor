import type { InputImageNode } from "@/hooks/useInputImageNodes";
import { cn } from "@/lib/utils";
import { TbCheck } from "react-icons/tb";

/**
 * Choix des images jointes au prompt, parmi les nodes image branchés en entrée.
 *
 * Une vignette par node source, pas par image : c'est le node qu'on branche, et
 * un node multi-image joint toutes ses images d'un bloc. Le badge dit combien
 * elles sont, pour que le compteur de plafond ne surprenne personne.
 *
 * Le numéro sur une vignette sélectionnée n'est pas décoratif : c'est l'ordre
 * dans lequel les images partent dans `input_references`. Il n'existe aucune
 * syntaxe pour désigner une référence depuis le prompt (cf. la doc OpenRouter),
 * donc c'est à l'utilisateur de les décrire avec ses mots — et pour ça il faut
 * qu'il voie ce qu'il joint, et dans quel ordre.
 */
export default function ImageReferencePicker({
  inputNodes,
  selectedNodeIds,
  attachedImageCount,
  onToggle,
  maxReferenceImages,
  disabled,
}: {
  inputNodes: InputImageNode[];
  /** Ids de node canvas, dans l'ordre où l'utilisateur les a choisis. */
  selectedNodeIds: string[];
  /** Total d'images jointes, calculé par l'appelant qui s'en sert aussi pour
   *  bloquer l'envoi — une seule source de vérité pour le plafond. */
  attachedImageCount: number;
  onToggle: (nodeId: string) => void;
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
        {supportsReferences && (
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
          !supportsReferences && "pointer-events-none opacity-40",
        )}
      >
        {inputNodes.map((node) => {
          const position = selectedNodeIds.indexOf(node.nodeId);
          const isSelected = position !== -1;
          // Une vignette non sélectionnée qui ferait déborder le plafond n'est
          // pas cliquable : mieux vaut l'empêcher que laisser partir une
          // requête payante vouée au refus. Une déjà sélectionnée reste
          // toujours cliquable, sinon on ne pourrait plus redescendre.
          const wouldOverflow =
            !isSelected &&
            attachedImageCount + node.images.length > maxReferenceImages;
          const isDisabled = disabled || !supportsReferences || wouldOverflow;

          return (
            <button
              key={node.nodeId}
              type="button"
              disabled={isDisabled}
              onClick={() => onToggle(node.nodeId)}
              title={
                wouldOverflow
                  ? `Too many images for this model (${node.images.length} more)`
                  : node.title
              }
              className={cn(
                "group relative size-12 shrink-0 overflow-hidden rounded-md border-2 transition-colors",
                isSelected
                  ? "border-primary"
                  : "border-transparent ring-1 ring-slate-200 hover:ring-slate-300",
                isDisabled && !isSelected && "cursor-not-allowed opacity-40",
              )}
            >
              <img
                src={node.images[0].url}
                alt={node.title}
                className="size-full object-cover"
                draggable={false}
              />

              {isSelected && (
                <span className="absolute left-0 top-0 flex size-4 items-center justify-center rounded-br-md bg-primary text-[10px] font-semibold leading-none text-primary-foreground tabular-nums">
                  {position + 1}
                </span>
              )}

              {node.images.length > 1 && (
                <span className="absolute bottom-0 right-0 rounded-tl-md bg-black/65 px-1 text-[10px] font-medium leading-4 text-white tabular-nums">
                  &times;{node.images.length}
                </span>
              )}

              {isSelected && (
                <span className="absolute inset-0 flex items-center justify-center bg-primary/15">
                  <TbCheck className="text-primary drop-shadow" size={18} />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {supportsReferences
          ? "Describe them in the prompt, in order — e.g. “using the attached sketch as the structure”."
          : "This model does not accept reference images."}
      </p>
    </div>
  );
}
