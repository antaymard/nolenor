import type { ComponentProps, ReactNode, Ref } from "react";
import { Button } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";

interface NodeToolbarButtonProps extends ComponentProps<typeof Button> {
  label: string;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * Standard node-toolbar button: 18px icon + visible text label.
 * The `ghost` variant lives on the pill background set by
 * `CanvasNodeToolbar` — no doubled `outline` border, and the label fixes
 * discoverability (nobody guesses `TbMaximize` means "Open").
 */
export function NodeToolbarButton({
  label,
  title,
  className,
  children,
  ref,
  ...props
}: NodeToolbarButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      title={title ?? label}
      aria-label={props["aria-label"] ?? label}
      ref={ref}
      className={cn(
        "h-8 gap-1.5 px-2.5 text-[13px] font-medium [&_svg:not([class*='size-'])]:size-[18px]",
        className,
      )}
      {...props}
    >
      {children}
      {label}
    </Button>
  );
}
