import { TbX } from "react-icons/tb";

// Bouton clear partagé par les triggers des variants de date. Le
// stopPropagation est essentiel : sans lui, le clic remonterait au trigger
// englobant de PopoverShell et rouvrirait le popover qu'on vient d'utiliser
// pour effacer la valeur.
export default function DateClearButton({
  onClear,
}: {
  onClear: () => void;
}) {
  return (
    <button
      type="button"
      className="ml-auto shrink-0 opacity-40 hover:opacity-100"
      title="Clear date"
      onClick={(e) => {
        e.stopPropagation();
        onClear();
      }}
    >
      <TbX size={12} />
    </button>
  );
}
