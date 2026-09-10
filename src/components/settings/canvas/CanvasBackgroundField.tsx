import { useId } from "react";
import {
  CANVAS_BG_PRESETS,
  VARIANT_DEFAULT_SIZE,
  previewStyle,
  type CanvasBackgroundVariant,
  type ResolvedCanvasBackground,
} from "@/lib/canvasBackground";
import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { cn } from "@/lib/utils";

const VARIANTS: { value: CanvasBackgroundVariant; label: string }[] = [
  { value: "lines", label: "Lines" },
  { value: "dots", label: "Dots" },
  { value: "cross", label: "Cross" },
  { value: "none", label: "None" },
];

interface CanvasBackgroundFieldProps {
  value: ResolvedCanvasBackground;
  onChange: (next: ResolvedCanvasBackground) => void;
  /** Version condensée pour la modale (preview mini, espacements réduits). */
  compact?: boolean;
  disabled?: boolean;
  /** Masque le helper "Shared with everyone…" (modale : le save dit déjà tout). */
  hideHint?: boolean;
}

/**
 * Bloc de customisation du background, purement contrôlé : aucun Convex,
 * aucune logique de save. Réutilisable dans settings et dans la modale
 * create/edit (via `compact`).
 */
export default function CanvasBackgroundField({
  value,
  onChange,
  compact = false,
  disabled = false,
  hideHint = false,
}: CanvasBackgroundFieldProps) {
  const uid = useId();
  const gapId = `${uid}-gap`;
  const sizeId = `${uid}-size`;

  const set = (patch: Partial<ResolvedCanvasBackground>) =>
    onChange({ ...value, ...patch });

  return (
    <div
      className={
        compact
          ? "grid gap-3 sm:grid-cols-[1fr_140px]"
          : "grid gap-4 md:grid-cols-[1fr_220px]"
      }
    >
      <div
        className={
          compact
            ? "space-y-3 rounded-md border border-gray-200 bg-white p-3"
            : "space-y-4 rounded-md border border-gray-200 bg-white p-4"
        }
      >
        <div className="space-y-2">
          <Label>Background color</Label>
          <div className="flex flex-wrap items-center gap-2">
            {CANVAS_BG_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                title={preset}
                aria-label={`Use ${preset} as background`}
                disabled={disabled}
                onClick={() => set({ bgColor: preset })}
                className={cn(
                  "h-7 w-7 rounded-full border border-gray-300 disabled:opacity-50",
                  value.bgColor.toLowerCase() === preset.toLowerCase() &&
                    "ring-2 ring-gray-900 ring-offset-2",
                )}
                style={{ backgroundColor: preset }}
              />
            ))}
            <input
              type="color"
              value={value.bgColor}
              disabled={disabled}
              onChange={(event) => set({ bgColor: event.target.value })}
              aria-label="Custom background color"
              className="h-7 w-10 cursor-pointer rounded border border-gray-300 bg-white p-0.5 disabled:opacity-50"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Pattern</Label>
          <div className="flex flex-wrap gap-1.5">
            {VARIANTS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={value.variant === option.value ? "default" : "outline"}
                size="sm"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    ...value,
                    variant: option.value,
                    // Taille sensée pour le nouveau motif, sinon un
                    // lineWidth de 0.3 donne des points invisibles.
                    size:
                      option.value === "none"
                        ? value.size
                        : VARIANT_DEFAULT_SIZE[option.value],
                  })
                }
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>

        {value.variant !== "none" && (
          <>
            <div className="space-y-2">
              <Label>Pattern color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={value.patternColor}
                  disabled={disabled}
                  onChange={(event) =>
                    set({ patternColor: event.target.value })
                  }
                  aria-label="Custom pattern color"
                  className="h-7 w-10 cursor-pointer rounded border border-gray-300 bg-white p-0.5 disabled:opacity-50"
                />
                <span className="text-xs text-gray-500">
                  {value.patternColor}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={gapId}>
                Spacing ({Math.round(value.gap)}px)
              </Label>
              <input
                id={gapId}
                type="range"
                min={8}
                max={80}
                step={1}
                value={value.gap}
                disabled={disabled}
                onChange={(event) =>
                  set({ gap: Number(event.target.value) })
                }
                className="w-full"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={sizeId}>
                {value.variant === "lines" ? "Line width" : "Dot size"} (
                {value.variant === "lines"
                  ? (Math.round(value.size * 10) / 10).toFixed(1)
                  : value.size}
                )
              </Label>
              <input
                id={sizeId}
                type="range"
                min={0.2}
                max={12}
                step={value.variant === "lines" ? 0.1 : 0.5}
                value={value.size}
                disabled={disabled}
                onChange={(event) =>
                  set({ size: Number(event.target.value) })
                }
                className="w-full"
              />
            </div>
          </>
        )}
      </div>

      <div className="space-y-2">
        <Label>Preview</Label>
        <div
          className={
            compact
              ? "h-24 rounded-md border border-gray-200"
              : "h-44 rounded-md border border-gray-200"
          }
          style={previewStyle(value)}
          aria-label="Background preview"
        />
        {!hideHint && (
          <p className="text-xs text-gray-500">
            Shared with everyone who can see this canvas.
          </p>
        )}
      </div>
    </div>
  );
}
