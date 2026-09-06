import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

/**
 * Le style d'une cellule qui suit le déplacement de sa colonne.
 *
 * Il était écrit quatre fois — en-tête, cellule, ligne fantôme, pied de
 * calculs — et les deux dernières copies avaient dérivé : la ligne fantôme
 * appelait `useSortable` hors de tout `SortableContext` (donc `transform` était
 * toujours nul, et elle enregistrait quand même des ids de colonne comme cibles
 * de dépôt dans le contexte des LIGNES), et le pied n'avait pas de transform du
 * tout. Un seul endroit rend cette dérive impossible.
 */
export function sortableCellStyle(
  transform: Parameters<typeof CSS.Translate.toString>[0],
  isDragging: boolean,
  size: number,
): CSSProperties {
  return {
    opacity: isDragging ? 0.8 : 1,
    position: "relative",
    transform: CSS.Translate.toString(transform),
    transition: "width transform 0.2s ease-in-out",
    width: size,
    overflow: "hidden",
  };
}

/**
 * À utiliser dans une cellule de corps, de ligne fantôme ou de pied. L'en-tête
 * a besoin en plus des `listeners` de la poignée, il appelle donc `useSortable`
 * lui-même et se contente de `sortableCellStyle`.
 *
 * Doit être rendu à l'intérieur du `SortableContext` horizontal des colonnes,
 * sans quoi le hook ne rend rien et pollue le contexte englobant.
 */
export function useSortableCellStyle(columnId: string, size: number) {
  const { isDragging, setNodeRef, transform } = useSortable({ id: columnId });
  return { setNodeRef, style: sortableCellStyle(transform, isDragging, size) };
}
