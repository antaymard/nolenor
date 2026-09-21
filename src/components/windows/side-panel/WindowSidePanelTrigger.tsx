import { TbLayoutSidebarRight } from "react-icons/tb";
import { cn } from "@/lib/utils";

/**
 * Bouton d'ouverture du panel latéral, au format des boutons du header de
 * window (même taille/survol que refresh/minimize). Contrairement à eux, son
 * fond reste visible tant que le panel est ouvert — pas seulement au survol —
 * pour que l'état "ouvert" soit lisible même la souris ailleurs.
 */
export function WindowSidePanelTrigger({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-window-control="true"
      className={cn(
        "shrink-0 rounded-full opacity-50 hover:bg-blue-500/15 hover:text-blue-600 hover:opacity-100 size-7 my-1 flex items-center justify-center",
        open && "bg-blue-500/15 text-blue-600 opacity-100",
      )}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClick}
      aria-pressed={open}
      aria-label="Toggle side panel"
      title="Panel"
    >
      <TbLayoutSidebarRight size={15} />
    </button>
  );
}
