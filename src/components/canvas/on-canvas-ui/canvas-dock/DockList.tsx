import type { ReactNode } from "react";

/**
 * La coquille d'une liste du dock — la même pour les repères et pour les
 * windows minimisées.
 *
 * Elle porte le matériau de panneau de la maison (celui de `ChatContainer`,
 * qui est aussi celui de `dialog` et `popover`), l'en-tête qui nomme la liste
 * — indispensable ici, puisqu'on bascule de l'une à l'autre au même endroit —
 * et le scroll. Ce qu'elle ne fait pas : parler de repères ou de windows. Les
 * deux appelants lui passent des lignes déjà construites.
 */
export default function DockList({
  title,
  count,
  headerAction,
  footer,
  isEmpty,
  emptyLabel,
  children,
}: {
  title: string;
  count?: number;
  /** Une action au bout de l'en-tête (« Close all » n'en est pas une : cf. `footer`). */
  headerAction?: ReactNode;
  /** Une ligne d'action en pied, séparée du corps. */
  footer?: ReactNode;
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
        {headerAction}
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

      {footer}
    </div>
  );
}
