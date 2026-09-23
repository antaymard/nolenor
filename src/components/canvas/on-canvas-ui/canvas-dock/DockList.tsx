import type { ReactNode } from "react";
import { TbX } from "react-icons/tb";

/**
 * La coquille de la liste des repères, telle que la déplie le dock.
 *
 * Elle porte le matériau de panneau de la maison (celui de `ChatContainer`,
 * qui est aussi celui de `dialog` et `popover`), l'en-tête qui nomme la liste
 * et le scroll. Elle ne parle pas de repères : l'appelant lui passe des lignes
 * déjà construites.
 */
export default function DockList({
  title,
  count,
  isEmpty,
  emptyLabel,
  onClose,
  children,
}: {
  title: string;
  count?: number;
  /** Replie le panneau : le même geste que recliquer le bouton du dock. */
  onClose?: () => void;
  isEmpty: boolean;
  emptyLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="flex max-h-96 w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_6px_20px_rgba(15,23,42,0.12)]">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-slate-200 px-3">
        <p className="min-w-0 flex-1 truncate text-sm font-bold tracking-tight text-slate-700">
          {title}
          {count !== undefined && (
            <span className="ml-1 font-medium tabular-nums text-muted-foreground">
              {count}
            </span>
          )}
        </p>
        {onClose && (
          // `-mr-1.5` : la croix s'aligne sur le bord de la liste, pas sur
          // le padding de l'en-tête.
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()}`}
            title="Close"
            className="-mr-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <TbX size={14} />
          </button>
        )}
      </div>

      {isEmpty ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1">
          {children}
        </div>
      )}
    </div>
  );
}
