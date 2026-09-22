import { TbBookmarkFilled } from "react-icons/tb";

/**
 * La pastille d'un node bookmarké : elle informe, elle ne se clique pas — le
 * repère se gère depuis le panneau de la toolbar. `pointer-events-none` :
 * sinon elle avalerait le début d'un drag qui part du bord du node.
 *
 * Se rend sur un parent positionné (`relative`) qui ne rogne pas (pas
 * d'`overflow-hidden` au-dessus d'elle) : elle déborde volontairement du coin.
 */
export default function BookmarkedBadge() {
  return (
    <TbBookmarkFilled
      size={14}
      aria-hidden
      className="pointer-events-none absolute -top-0.75 right-2 z-10 text-amber-500"
    />
  );
}
