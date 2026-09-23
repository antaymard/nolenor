import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Une section du panneau du dock : les windows minimisées ou les repères.
 *
 * Les deux listes vivent dans le même panneau, l'une au-dessus de l'autre. Il
 * faut donc qu'on voie où finit l'une et où commence l'autre. Chaque section
 * a pour ça un petit en-tête en capitales, et un trait au-dessus de lui dès
 * qu'une autre section le précède (`withDivider`). L'en-tête est `sticky` :
 * quand on fait défiler une longue liste de repères, on sait toujours dans
 * quelle section on est.
 *
 * La section ne connaît ni les repères ni les windows. Les appelants lui
 * passent des lignes déjà construites.
 */
export default function DockSection({
  title,
  count,
  headerAction,
  withDivider,
  isEmpty,
  emptyLabel,
  children,
}: {
  title: string;
  count?: number;
  /** Une action discrète au bout de l'en-tête, propre à cette section. */
  headerAction?: ReactNode;
  /** Trait de séparation au-dessus de l'en-tête. */
  withDivider?: boolean;
  isEmpty: boolean;
  emptyLabel: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col">
      <div
        className={cn(
          "sticky top-0 z-10 flex h-7 shrink-0 items-center gap-1 bg-white px-3",
          withDivider && "border-t border-slate-200",
        )}
      >
        <p className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
          {count !== undefined && (
            <span className="ml-1 tabular-nums">{count}</span>
          )}
        </p>
        {headerAction}
      </div>

      {isEmpty ? (
        <p className="px-4 pt-2 pb-4 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      ) : (
        <div className="flex flex-col gap-0.5 px-1 pb-1">{children}</div>
      )}
    </section>
  );
}
