import type { ReactNode } from "react";

/** Le titre d'une page du shell, son sous-titre, et son action principale. */
export default function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">
          {title}
        </h1>
        {subtitle && <p className="text-[15px] text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}
