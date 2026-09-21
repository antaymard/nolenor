import { cn } from "@/lib/utils";

/**
 * Small sentence-case caption grouping controls inside a node toolbar
 * (e.g. "Style" before the H1/H2/H3 segmented control).
 */
export function NodeToolbarLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "px-1 text-[12px] font-medium text-muted-foreground select-none",
        className,
      )}
    >
      {children}
    </span>
  );
}
