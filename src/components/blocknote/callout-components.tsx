import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { colors } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

export const CALLOUT_DEFAULT_ICON = "💡";

/** Curated quick-pick icons for callouts (cf. plan: no full emoji-mart picker). */
const CALLOUT_ICONS = [
  "💡",
  "⚠️",
  "✅",
  "❌",
  "🔥",
  "📌",
  "ℹ️",
  "🎯",
  "📝",
  "🚀",
  "⭐",
  "🔔",
  "📣",
  "❗",
  "❓",
  "🛠️",
  "🧠",
  "💬",
  "📅",
  "🔒",
  "🧪",
  "🎨",
  "💰",
  "📈",
];

/**
 * Callout colors: the predefined canvas node colors only
 * (src/components/ui/styles.ts). "transparent" is excluded (meaningless for a
 * callout background) and "default" maps to the muted look, like Plate.js.
 */
const CALLOUT_COLORS = [
  "default",
  "blue",
  "red",
  "yellow",
  "green",
  "pink",
  "orange",
  "purple",
] as const;

function calloutBgClass(color: string): string {
  if (color !== "default" && color !== "transparent" && color in colors) {
    return colors[color as keyof typeof colors].lightBg;
  }
  return "bg-muted";
}

const emojiFontStyle = {
  fontFamily:
    '"Apple Color Emoji", "Segoe UI Emoji", NotoColorEmoji, "Noto Color Emoji", "Segoe UI Symbol", "Android Emoji", EmojiSymbols',
};

/**
 * Shared visual layout of the callout: rounded colored box, icon control on
 * the left, editable rich text on the right (`contentRef`). Used by the
 * editable editor render (icon popover) and the static HTML export (plain
 * icon) in callout-block.tsx.
 */
export function CalloutLayout({
  color,
  control,
  contentRef,
}: {
  color: string;
  control: React.ReactNode;
  contentRef: (node: HTMLElement | null) => void;
}) {
  return (
    <div
      className={cn(
        "my-1 flex w-full gap-2 rounded-sm p-4 pl-3",
        calloutBgClass(color),
      )}
    >
      {control}
      <div ref={contentRef} className="w-full" />
    </div>
  );
}

/** Icon button + popover holding the emoji quick-pick grid and color swatches. */
export function CalloutControls({
  icon,
  color,
  onSelectIcon,
  onSelectColor,
}: {
  icon: string;
  color: string;
  onSelectIcon: (icon: string) => void;
  onSelectColor: (color: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          contentEditable={false}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center select-none rounded text-[18px] leading-none hover:bg-black/10"
          style={emojiFontStyle}
        >
          {icon || CALLOUT_DEFAULT_ICON}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        <div className="grid grid-cols-8 gap-0.5">
          {CALLOUT_ICONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className="flex size-7 cursor-pointer items-center justify-center rounded text-[16px] leading-none hover:bg-muted"
              style={emojiFontStyle}
              onClick={() => {
                onSelectIcon(emoji);
                setOpen(false);
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
        <div className="mt-2 border-t pt-2">
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            Color
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CALLOUT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c === "default" ? "Default" : colors[c].label}
                className={cn(
                  "size-5 cursor-pointer rounded-full border border-black/10",
                  c === "default" ? "bg-muted" : colors[c].lightBg,
                  c === color && "ring-2 ring-slate-400 ring-offset-1",
                )}
                onClick={() => {
                  onSelectColor(c);
                  setOpen(false);
                }}
              />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
