import { useState } from "react";
import { createReactInlineContentSpec } from "@blocknote/react";

import {
  normalizePillProps,
  sanitizePillText,
  PILL_COLORS,
  PILL_DEFAULT_COLOR,
  PILL_DEFAULT_TEXT,
  PILL_DEFAULT_VARIANT,
  PILL_TEXT_MAX,
  type PillColor,
  type PillProps,
  type PillVariant,
} from "@/../convex/lib/colorPill";
import { Input } from "@/components/shadcn/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import { colors } from "@/components/ui/styles";
import { cn } from "@/lib/utils";

/**
 * Pastel: soft fill + text in the solid shade of the hue (like the nodes).
 * Solid: the palette's `solidBg` + white text. Written out in full: Tailwind
 * only generates the classes it reads literally.
 */
const pastelClassName: Record<PillColor, string> = {
  red: "bg-red-100 text-red-700",
  orange: "bg-orange-100 text-orange-700",
  yellow: "bg-yellow-100 text-yellow-800",
  lime: "bg-lime-100 text-lime-800",
  green: "bg-green-100 text-green-700",
  teal: "bg-teal-100 text-teal-700",
  sky: "bg-sky-100 text-sky-700",
  blue: "bg-blue-100 text-blue-700",
  purple: "bg-purple-100 text-purple-700",
  pink: "bg-pink-100 text-pink-700",
  default: "bg-slate-100 text-slate-700",
};

function pillColorClassName(color: PillColor, variant: PillVariant): string {
  return variant === "solid"
    ? cn(colors[color].solidBg, "text-white")
    : pastelClassName[color];
}

const pillBaseClassName =
  "inline-block max-w-64 truncate rounded-sm px-1.5 py-[0.12em] align-middle text-[0.85em] leading-none font-semibold";

/**
 * Static (read-only) rendering of a pill. Used by the canvas read-only
 * renderer (BlockNoteStatic, via the registry) AND by the spec's
 * `toExternalHTML` (clipboard / HTML export) — same convention as DatePillView.
 */
export function PillView(props: {
  text?: string;
  color?: string;
  variant?: string;
}) {
  const { text, color, variant } = normalizePillProps(props);
  return (
    <span className={cn(pillBaseClassName, pillColorClassName(color, variant))}>
      {text || PILL_DEFAULT_TEXT}
    </span>
  );
}

/**
 * Editable pill: clicking it opens a popover to change its text, color and
 * variant. Edits are held in a draft and committed once, when the popover
 * closes (or on Enter), so the node is not rewritten on every keystroke.
 */
function EditablePill({
  value,
  onCommit,
}: {
  value: PillProps;
  onCommit: (next: PillProps) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<PillProps>(value);

  const commit = () => {
    const text = sanitizePillText(draft.text) || value.text || PILL_DEFAULT_TEXT;
    const next = { ...draft, text };
    if (
      next.text !== value.text ||
      next.color !== value.color ||
      next.variant !== value.variant
    ) {
      onCommit(next);
    }
  };

  const shown = open ? draft : value;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(value);
        else commit();
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <span
          className={cn(
            pillBaseClassName,
            pillColorClassName(shown.color, shown.variant),
            "cursor-pointer",
          )}
        >
          {shown.text || PILL_DEFAULT_TEXT}
        </span>
      </PopoverTrigger>
      <PopoverContent className="w-60 space-y-2 p-2">
        <Input
          autoFocus
          value={draft.text}
          maxLength={PILL_TEXT_MAX}
          placeholder={PILL_DEFAULT_TEXT}
          onChange={(e) => setDraft({ ...draft, text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
              setOpen(false);
            }
          }}
        />
        <div className="flex gap-1">
          {(["pastel", "solid"] as const).map((variant) => (
            <button
              key={variant}
              type="button"
              className={cn(
                "flex-1 cursor-pointer rounded px-2 py-1 text-xs capitalize hover:bg-muted",
                draft.variant === variant && "bg-muted font-medium",
              )}
              onClick={() => setDraft({ ...draft, variant })}
            >
              {variant}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {PILL_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={colors[color].label}
              className={cn(
                "size-5 cursor-pointer rounded-full border border-black/10",
                pillColorClassName(color, draft.variant),
                color === draft.color && "ring-2 ring-slate-400 ring-offset-1",
              )}
              onClick={() => setDraft({ ...draft, color })}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Colored pill inline content (inserted via `/pill` in the slash menu): a short
 * label in a colored box, like a Confluence status. Stored as
 * `{ type: "pill", props: { text, color, variant } }`; the agent reads and
 * writes it as `[[pill:<color>[:solid]|<text>]]` (convex/lib/colorPill.ts).
 */
export const pillInlineContentSpec = createReactInlineContentSpec(
  {
    type: "pill",
    propSchema: {
      text: { default: PILL_DEFAULT_TEXT },
      color: { default: PILL_DEFAULT_COLOR as string },
      variant: { default: PILL_DEFAULT_VARIANT as string },
    },
    content: "none",
  },
  {
    render: (props) => (
      <EditablePill
        value={normalizePillProps(props.inlineContent.props)}
        onCommit={(next) =>
          props.updateInlineContent({ type: "pill", props: next })
        }
      />
    ),
    toExternalHTML: (props) => <PillView {...props.inlineContent.props} />,
  },
);
