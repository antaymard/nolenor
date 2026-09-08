import type { CSSProperties } from "react";
import { CSS } from "@dnd-kit/utilities";

/**
 * Le style d'une cellule de colonne : largeur figée, débordement coupé, et le
 * `transform` qui la fait suivre un déplacement de colonne.
 *
 * Le `transform` n'a de sens que pour l'EN-TÊTE, seul élément à s'enregistrer
 * comme sortable sous l'id de sa colonne. Les cellules de corps, de ligne
 * fantôme et de pied appelaient `useSortable` avec ce même id : elles le
 * réenregistraient une fois par ligne, et comme dnd-kit indexe ses draggables
 * et ses droppables par id dans des `Map`, la dernière enregistrée écrasait
 * l'en-tête. Elles se contentent maintenant de `columnCellStyle`.
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
 * Le même style, pour une cellule qui ne participe pas au drag : corps, ligne
 * fantôme, pied de calculs. Elle garde sa largeur et son clipping, elle ne
 * s'anime simplement pas pendant qu'on déplace sa colonne.
 */
export function columnCellStyle(size: number): CSSProperties {
  return sortableCellStyle(null, false, size);
}
