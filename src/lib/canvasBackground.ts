import { BackgroundVariant } from "@xyflow/react";
import type { CSSProperties } from "react";
import type { Canvas } from "@/types/convex";

export type CanvasBackgroundVariant = "lines" | "dots" | "cross" | "none";

export type CanvasBackground = NonNullable<Canvas["background"]>;

export type ResolvedCanvasBackground = {
  bgColor: string;
  patternColor: string;
  variant: CanvasBackgroundVariant;
  gap: number;
  size: number;
};

/** Défaut front : les nouveaux canvas (background absent) gardent l'aspect actuel. */
export const DEFAULT_CANVAS_BACKGROUND: ResolvedCanvasBackground = {
  bgColor: "oklch(98.4% 0.003 247.858)",
  patternColor: "oklch(70.7% 0.165 254.624)",
  variant: "lines",
  gap: 25,
  size: 0.3,
};

/** Taille proposée quand on change de motif (lineWidth pour lines, dot/cross sinon). */
/** Défauts en dark mode, pour les canvas sans fond choisi. Un fond choisi
 *  explicitement est partagé avec tous les viewers et reste tel quel. */
export const DARK_CANVAS_BACKGROUND_COLORS = {
  bgColor: "oklch(0.17 0.042 265)",
  patternColor: "oklch(0.4 0.09 260)",
};

export const VARIANT_DEFAULT_SIZE: Record<CanvasBackgroundVariant, number> = {
  lines: 0.3,
  dots: 1.5,
  cross: 2,
  none: 0.3,
};

export const CANVAS_BG_PRESETS: string[] = [
  "#f8fafc",
  "#ffffff",
  "#f1f5f9",
  "#fefce8",
  "#f0fdf4",
  "#eff6ff",
  "#faf5ff",
  "#fff7ed",
  "#18181b",
  "#0f172a",
];

const BACKGROUND_VARIANT_MAP: Record<
  Exclude<CanvasBackgroundVariant, "none">,
  BackgroundVariant
> = {
  lines: BackgroundVariant.Lines,
  dots: BackgroundVariant.Dots,
  cross: BackgroundVariant.Cross,
};

export function resolveCanvasBackground(
  background: CanvasBackground | undefined,
  theme: "light" | "dark" = "light",
): ResolvedCanvasBackground {
  const defaults =
    theme === "dark"
      ? { ...DEFAULT_CANVAS_BACKGROUND, ...DARK_CANVAS_BACKGROUND_COLORS }
      : DEFAULT_CANVAS_BACKGROUND;
  return {
    bgColor: background?.bgColor ?? defaults.bgColor,
    patternColor: background?.patternColor ?? defaults.patternColor,
    variant: background?.variant ?? defaults.variant,
    gap: background?.gap ?? defaults.gap,
    size: background?.size ?? defaults.size,
  };
}

export function toReactFlowVariant(
  variant: CanvasBackgroundVariant,
): BackgroundVariant | null {
  if (variant === "none") return null;
  return BACKGROUND_VARIANT_MAP[variant];
}

export function clampBackgroundNumber(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Normalise un draft pour l'envoi serveur (clamp gap/size). */
export function sanitizeCanvasBackgroundForSave(
  draft: ResolvedCanvasBackground,
): CanvasBackground {
  return {
    bgColor: draft.bgColor,
    patternColor: draft.patternColor,
    variant: draft.variant,
    gap: clampBackgroundNumber(Math.round(draft.gap), 8, 80),
    size: clampBackgroundNumber(draft.size, 0.2, 12),
  };
}

/** Style CSS de la preview (settings + modale). */
export function previewStyle(draft: ResolvedCanvasBackground): CSSProperties {
  const px = `${draft.gap}px`;
  if (draft.variant === "none") {
    return { backgroundColor: draft.bgColor };
  }
  if (draft.variant === "dots") {
    const r = clampBackgroundNumber(draft.size, 0.5, 8);
    return {
      backgroundColor: draft.bgColor,
      backgroundImage: `radial-gradient(circle, ${draft.patternColor} ${r}px, transparent ${r + 0.6}px)`,
      backgroundSize: `${px} ${px}`,
    };
  }
  if (draft.variant === "cross") {
    const w = clampBackgroundNumber(draft.size, 0.5, 12);
    return {
      backgroundColor: draft.bgColor,
      backgroundImage: `linear-gradient(${draft.patternColor} 0 ${w}px, transparent ${w}px), linear-gradient(90deg, ${draft.patternColor} 0 ${w}px, transparent ${w}px)`,
      backgroundSize: `${px} ${px}`,
      backgroundPosition: "center",
    };
  }
  return {
    backgroundColor: draft.bgColor,
    backgroundImage: `linear-gradient(${draft.patternColor} 1px, transparent 1px), linear-gradient(90deg, ${draft.patternColor} 1px, transparent 1px)`,
    backgroundSize: `${px} ${px}`,
  };
}
