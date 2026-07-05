"use client";

import { cn } from "@/lib/utils";

import { Toolbar } from "../shadcn/toolbar";

export function FixedToolbar(props: React.ComponentProps<typeof Toolbar>) {
  return (
    <Toolbar
      {...props}
      className={cn(
        "scrollbar-hide sticky top-0 left-0 z-50 w-full justify-between overflow-x-auto rounded-t-lg border-b border-b-border p-1 backdrop-blur-sm supports-backdrop-blur:bg-background/60 bg-muted",
        props.className
      )}
    />
  );
}
