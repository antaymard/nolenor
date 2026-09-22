import type { ReactNode } from "react";
import type { IconType } from "react-icons";
import { cn } from "@/lib/utils";

/** Une action révélée au survol d'une ligne. */
export type DockRowAction = {
  icon: IconType;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

/**
 * Une ligne du dock, la même pour les repères et pour les windows minimisées.
 *
 * Les actions sont en `absolute` et révélées au survol, avec leur place
 * réservée par le `pr-*` du corps — et pas en flux comme dans une card. C'est
 * la forme juste pour une liste VERTICALE : une ligne ne peut pas grandir sans
 * pousser ses voisines, là où une card d'une bande horizontale le pouvait.
 * `group-focus-within` double le `group-hover` : les actions sont dans l'ordre
 * de tabulation, elles doivent se montrer quand on les atteint au clavier.
 *
 * Deux boutons frères plutôt qu'un bouton dans un bouton : la poignée de drag
 * et le corps cliquable sont côte à côte, donc aucun `stopPropagation` à
 * placer, et chaque cible reste un vrai contrôle pour le clavier.
 */
export default function DockRow({
  icon: Icon,
  label,
  title,
  muted,
  disabled,
  dragHandle,
  trailing,
  actions,
  editor,
  onClick,
  onMouseDown,
}: {
  icon: IconType | null;
  label: string;
  title?: string;
  /** Cible morte : libellé en italique grisé, corps inerte. */
  muted?: boolean;
  disabled?: boolean;
  /** La poignée dnd-kit, quand la liste est réordonnable. */
  dragHandle?: ReactNode;
  /** L'indicateur de cap, côté repères. */
  trailing?: ReactNode;
  actions: Array<DockRowAction>;
  /** Remplace le corps pendant un renommage. */
  editor?: ReactNode;
  onClick?: () => void;
  onMouseDown?: (event: React.MouseEvent) => void;
}) {
  return (
    <div className="group relative flex items-center rounded-lg hover:bg-accent">
      {dragHandle}

      {editor ?? (
        <button
          type="button"
          disabled={disabled}
          onClick={onClick}
          onMouseDown={onMouseDown}
          title={title ?? label}
          className={cn(
            "flex h-9 min-w-0 flex-1 items-center gap-2 pl-2 text-left",
            // La gouttière qui garde les actions au-dessus de rien : trois
            // boutons de 24px plus leurs gouttières. Le libellé se tronque
            // dessous, il ne passe jamais sous les icônes.
            actions.length >= 3 ? "pr-21" : "pr-15",
            disabled && "cursor-default",
          )}
        >
          {Icon ? (
            <Icon
              size={15}
              className={cn(
                "shrink-0 text-muted-foreground",
                muted && "opacity-50",
              )}
            />
          ) : null}
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-sm font-medium tracking-tight",
              muted && "italic text-muted-foreground",
            )}
          >
            {label}
          </span>
          {trailing}
        </button>
      )}

      {/* Masquées pendant l'édition : le champ de renommage prend toute la
          ligne, des icônes par-dessus n'auraient rien à faire là. */}
      {editor === undefined && (
        <div
          className={cn(
            "absolute right-1 flex items-center gap-0.5 opacity-0",
            "pointer-events-none transition-opacity duration-150",
            "group-hover:pointer-events-auto group-hover:opacity-100",
            "group-focus-within:pointer-events-auto group-focus-within:opacity-100",
            "motion-reduce:transition-none",
          )}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              disabled={action.disabled}
              onClick={action.onClick}
              onMouseDown={(event) => event.stopPropagation()}
              aria-label={action.label}
              title={action.label}
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md",
                "text-muted-foreground hover:bg-background disabled:opacity-30",
                action.destructive
                  ? "hover:text-destructive"
                  : "hover:text-foreground",
              )}
            >
              <action.icon size={14} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
