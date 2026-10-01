// The `pill` inline content: a short colored label inside the text, like a
// Confluence status lozenge (src/components/blocknote/pill-inline-content.tsx).
//
// Stored as `{ type: "pill", props: { text, color, variant } }`. The colors are
// the shared palette (colorsConfig.ts) minus `transparent` — a pill with no
// fill would read as plain text. `default` is the neutral gray.
//
// The agent reads and writes a pill as a token, the same way as a date pill:
//   [[pill:<color>|<text>]]        → pastel (soft fill, solid-colored text)
//   [[pill:<color>:solid|<text>]]  → solid  (solid fill, white text)
//
// Shared by the backend codec (convex/ia/helpers/blockNoteMarkdown.ts) and the
// frontend so both agree on the props and their defaults.

import { NODE_COLORS, type NodeColor } from "../config/colorsConfig";

export const PILL_COLORS = NODE_COLORS.filter(
  (c): c is Exclude<NodeColor, "transparent"> => c !== "transparent",
);
export type PillColor = (typeof PILL_COLORS)[number];

export const PILL_VARIANTS = ["pastel", "solid"] as const;
export type PillVariant = (typeof PILL_VARIANTS)[number];

export const PILL_DEFAULT_TEXT = "click-me";
export const PILL_DEFAULT_COLOR: PillColor = "default";
export const PILL_DEFAULT_VARIANT: PillVariant = "pastel";

/** Longest label a pill holds; a pill is a tag, not a sentence. */
export const PILL_TEXT_MAX = 60;

export function isPillColor(value: unknown): value is PillColor {
  return (PILL_COLORS as readonly unknown[]).includes(value);
}

export function isPillVariant(value: unknown): value is PillVariant {
  return (PILL_VARIANTS as readonly unknown[]).includes(value);
}

/**
 * A pill's text is one short line, and must not hold `[` / `]`: the token
 * body cannot contain `]`, and a bracket would end it early. Brackets become
 * parentheses, whitespace runs collapse, and the length is capped.
 */
export function sanitizePillText(text: string): string {
  return text
    .replace(/[[\]]/g, (c) => (c === "[" ? "(" : ")"))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, PILL_TEXT_MAX);
}

export type PillProps = {
  text: string;
  color: PillColor;
  variant: PillVariant;
};

/** Stored props (possibly partial, possibly hand-edited) → a valid pill. */
export function normalizePillProps(props: unknown): PillProps {
  const p = (props ?? {}) as Record<string, unknown>;
  return {
    text: typeof p.text === "string" ? sanitizePillText(p.text) : "",
    color: isPillColor(p.color) ? p.color : PILL_DEFAULT_COLOR,
    variant: isPillVariant(p.variant) ? p.variant : PILL_DEFAULT_VARIANT,
  };
}

/** `[[pill:<color>[:solid]|<text>]]` — the agent-facing spelling of a pill. */
export function formatPillToken(props: unknown): string {
  const { text, color, variant } = normalizePillProps(props);
  const head = variant === "solid" ? `${color}:solid` : color;
  return `[[pill:${head}|${text}]]`;
}

/**
 * The body of a `[[pill:…]]` token (what sits between `pill:` and `]]`) →
 * pill props, or null when it is not a valid pill: unknown color or variant,
 * missing `|`, or empty text.
 */
export function parsePillTokenBody(body: string): PillProps | null {
  const bar = body.indexOf("|");
  if (bar < 0) return null;
  const [color, variant = PILL_DEFAULT_VARIANT, ...extra] = body
    .slice(0, bar)
    .trim()
    .split(":");
  if (extra.length > 0 || !isPillColor(color) || !isPillVariant(variant)) {
    return null;
  }
  const text = sanitizePillText(body.slice(bar + 1));
  if (!text) return null;
  return { text, color, variant };
}
