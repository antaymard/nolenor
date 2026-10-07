import type { ReactNode } from "react";
import { BorderBeam } from "border-beam";
import { RUN_STATUS_BORDER } from "@/lib/threadRunStatus";
import { useResolvedTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { TaskView } from "../taskView";

/** Rayon du bloc, partagé avec le halo pour que les deux arrondis coïncident. */
const CARD_RADIUS_PX = 15;

/**
 * La coque d'une carte de tâche : bordure teintée par le statut, halo pendant
 * le run, largeur selon l'accent, ouverture de la conversation au clic.
 *
 * Le bloc reste blanc quel que soit l'état : seule la bordure se teinte (un
 * fond coloré noyait le halo, de la même famille de violets).
 */
export function TaskShell({
  view,
  onOpen,
  children,
}: {
  view: TaskView;
  onOpen: () => void;
  children: ReactNode;
}) {
  const theme = useResolvedTheme();
  const isRunning = view.status === "running";

  const card = (
    <div
      // `div` et non `button` : le bloc contient de vrais boutons.
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onOpen();
      }}
      style={{ borderRadius: CARD_RADIUS_PX }}
      className={cn(
        "group flex cursor-pointer flex-col gap-1.5 border bg-surface px-2.5 py-2 text-left text-slate-700",
        view.emphasis === "compact" ? "w-[272px]" : "w-full",
        view.emphasis === "attention" && "border-2",
        // Le halo rogne l'ombre d'un enfant : elle passe sur son wrapper.
        !isRunning && "shadow-sm",
        RUN_STATUS_BORDER[view.status],
      )}
    >
      {children}
    </div>
  );

  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
        view.emphasis === "compact" ? "shrink-0" : "w-full",
      )}
    >
      {isRunning ? (
        <BorderBeam
          size="pulse-inner"
          colorVariant="ocean"
          theme={theme}
          active
          strength={0.7}
          hueRange={12}
          borderRadius={CARD_RADIUS_PX}
          className="shadow-sm"
        >
          {card}
        </BorderBeam>
      ) : (
        card
      )}
    </div>
  );
}
