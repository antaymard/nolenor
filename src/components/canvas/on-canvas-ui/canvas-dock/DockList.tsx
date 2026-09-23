import type { ReactNode } from "react";

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
  children,
}: {
  title: string;
  count?: number;
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
