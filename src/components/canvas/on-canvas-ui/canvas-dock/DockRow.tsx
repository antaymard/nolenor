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
 * Le bout de ligne du dock : l'indicateur de cap au repos, les actions au
 * survol — au MÊME endroit.
 *
 * Les deux sont empilés dans une seule cellule de grille : la cellule prend la
 * largeur du plus large des deux, donc rien ne bouge quand on passe de l'un à
 * l'autre, et le titre n'a qu'une place à céder au lieu de deux (l'ancienne
 * gouttière réservée aux actions s'ajoutait à l'indicateur).
 *
 * L'élément parent doit porter la classe `group`. `group-focus-within` double
 * le `group-hover` : les actions sont dans l'ordre de tabulation, elles
 * doivent se montrer quand on les atteint au clavier.
 */
export function DockHoverActions({
  indicator,
  actions,
}: {
  indicator?: ReactNode;
  actions: Array<DockRowAction>;
}) {
  return (
    <div className="grid shrink-0 items-center justify-items-end pr-1">
      <div
        className={cn(
          "col-start-1 row-start-1 pointer-events-none pr-1",
          "group-hover:invisible group-focus-within:invisible",
        )}
      >
        {indicator}
      </div>
      <div
        className={cn(
          "col-start-1 row-start-1 flex items-center gap-0.5",
          "invisible group-hover:visible group-focus-within:visible",
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
    </div>
  );
}

/**
 * Une ligne de la liste des repères.
 *
 * Deux boutons frères plutôt qu'un bouton dans un bouton : la poignée de drag,
 * le corps cliquable et les actions sont côte à côte, donc aucun
 * `stopPropagation` à placer sur le clic, et chaque cible reste un vrai
 * contrôle pour le clavier.
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
}: {
  icon: IconType | null;
  label: string;
  title?: string;
  /** Cible morte : libellé en italique grisé, corps inerte. */
  muted?: boolean;
  disabled?: boolean;
  /** La poignée dnd-kit, quand la liste est réordonnable. */
  dragHandle?: ReactNode;
  /** L'indicateur de cap, remplacé par les actions au survol. */
  trailing?: ReactNode;
  actions: Array<DockRowAction>;
  /** Remplace le corps pendant un renommage. */
  editor?: ReactNode;
  onClick?: () => void;
}) {
  return (
    <div className="group relative flex items-center rounded-lg hover:bg-accent">
      {dragHandle}

      {editor ?? (
        <>
          <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            title={title ?? label}
            className={cn(
              "flex h-9 min-w-0 flex-1 items-center gap-2 pr-1 pl-2 text-left",
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
          </button>
          {/* Masqué pendant l'édition : le champ de renommage prend toute la
              ligne. */}
          <DockHoverActions indicator={trailing} actions={actions} />
        </>
      )}
    </div>
  );
}
