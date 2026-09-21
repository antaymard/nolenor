import { TbPencil } from "react-icons/tb";

/** Le trigger varie (toolbar canvas vs header de window), le contenu non. */
export type NodeEditTriggerVariant = "toolbar" | "window";

/**
 * Crayon au format des boutons du header de window (`WindowFrame` flottant et
 * `FullscreenWindowFrame`) : même taille, même survol que refresh/minimize.
 *
 * `data-window-control` + `stopPropagation` au mousedown : sans ça, le header
 * flottant prendrait le clic pour le début d'un drag (cf. `WindowFrame`) et
 * `WindowsContainer` y verrait un bring-to-front.
 */
export function WindowEditTrigger({ title }: { title: string }) {
  return (
    <button
      type="button"
      data-window-control="true"
      className="shrink-0 rounded-full opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100 size-7 my-1 flex items-center justify-center"
      onMouseDown={(e) => e.stopPropagation()}
      title={title}
      aria-label={title}
    >
      <TbPencil size={15} />
    </button>
  );
}
