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
  bgColor: "#f8fafc",
  patternColor: "#e2e8f0",
  variant: "lines",
  gap: 20,
  size: 0.3,
};

/** Taille proposée quand on change de motif (lineWidth pour lines, dot/cross sinon). */
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
): ResolvedCanvasBackground {
  return {
    bgColor: background?.bgColor ?? DEFAULT_CANVAS_BACKGROUND.bgColor,
    patternColor:
      background?.patternColor ?? DEFAULT_CANVAS_BACKGROUND.patternColor,
    variant: background?.variant ?? DEFAULT_CANVAS_BACKGROUND.variant,
    gap: background?.gap ?? DEFAULT_CANVAS_BACKGROUND.gap,
    size: background?.size ?? DEFAULT_CANVAS_BACKGROUND.size,
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
