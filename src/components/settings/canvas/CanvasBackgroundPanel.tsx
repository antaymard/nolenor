import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
import { TbExclamationCircle } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  CANVAS_BG_PRESETS,
  DEFAULT_CANVAS_BACKGROUND,
  VARIANT_DEFAULT_SIZE,
  clampBackgroundNumber,
  resolveCanvasBackground,
  type CanvasBackgroundVariant,
  type ResolvedCanvasBackground,
} from "@/lib/canvasBackground";
import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { Spinner } from "@/components/shadcn/spinner";
import { toastError } from "@/components/utils/errorUtils";
import toast from "react-hot-toast";
import { cn } from "@/lib/utils";

const VARIANTS: { value: CanvasBackgroundVariant; label: string }[] = [
  { value: "lines", label: "Lines" },
  { value: "dots", label: "Dots" },
  { value: "cross", label: "Cross" },
  { value: "none", label: "None" },
];

function previewStyle(draft: ResolvedCanvasBackground): CSSProperties {
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

export default function CanvasBackgroundPanel({
  initialCanvasId,
}: {
  initialCanvasId?: string;
}) {
  const canvases = useQuery(api.canvases.listUserCanvases);
  const updateBackground = useMutation(api.canvases.updateCanvasBackground);
  const [selectedCanvasId, setSelectedCanvasId] =
    useState<Id<"canvases"> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Owner-only : les canvas partagés (viewer/editor) n'apparaissent pas,
  // la mutation exige "owner" côté serveur de toute façon.
  const ownedCanvases = useMemo(
    () => (canvases ?? []).filter((canvas) => !canvas.shared),
    [canvases],
  );

  // Sélection : ?canvasId= si c'est un canvas possédé, sinon le plus récent.
  useEffect(() => {
    if (ownedCanvases.length === 0) {
      setSelectedCanvasId(null);
      return;
    }
    if (
      initialCanvasId &&
      ownedCanvases.some((canvas) => canvas._id === initialCanvasId)
    ) {
      setSelectedCanvasId(initialCanvasId as Id<"canvases">);
      return;
    }
    if (
      selectedCanvasId === null ||
      !ownedCanvases.some((canvas) => canvas._id === selectedCanvasId)
    ) {
      setSelectedCanvasId(ownedCanvases[0]._id);
    }
  }, [ownedCanvases, initialCanvasId, selectedCanvasId]);

  const canvas = useQuery(
    api.canvases.readCanvas,
    selectedCanvasId ? { canvasId: selectedCanvasId } : "skip",
  );
  const serverBackground = useMemo(
    () =>
      resolveCanvasBackground(
        canvas === undefined || canvas === null
          ? undefined
          : (canvas.background ?? undefined),
      ),
    [canvas],
  );

  const [draft, setDraft] =
    useState<ResolvedCanvasBackground>(serverBackground);

  // Resync quand on change de canvas ou que le serveur bouge (autre onglet).
  useEffect(() => {
    setDraft(serverBackground);
  }, [serverBackground]);

  if (canvases === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-4 text-sm text-muted-foreground">
        <Spinner /> Loading your canvases…
      </div>
    );
  }

  if (ownedCanvases.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-4 text-sm text-gray-500">
        <TbExclamationCircle /> You have no canvas yet — create one first, then
        come back to style its background.
      </div>
    );
  }

  const isDirty =
    draft.bgColor !== serverBackground.bgColor ||
    draft.patternColor !== serverBackground.patternColor ||
    draft.variant !== serverBackground.variant ||
    draft.gap !== serverBackground.gap ||
    draft.size !== serverBackground.size;

  const handleSave = async () => {
    if (!selectedCanvasId || !isDirty) return;
    setIsSaving(true);
    try {
      await updateBackground({
        canvasId: selectedCanvasId,
        background: {
          bgColor: draft.bgColor,
          patternColor: draft.patternColor,
          variant: draft.variant,
          gap: clampBackgroundNumber(Math.round(draft.gap), 8, 80),
          size: clampBackgroundNumber(draft.size, 0.2, 12),
        },
      });
      toast.success("Canvas background updated — visible to everyone.");
    } catch (error) {
      toastError(error, "Could not update the canvas background.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => setDraft(DEFAULT_CANVAS_BACKGROUND);

  return (
    <div className="space-y-4 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor="canvas-background-select">Canvas</Label>
        <select
          id="canvas-background-select"
          className="block w-full max-w-md rounded-md border border-gray-300 bg-white p-2 text-sm"
          value={selectedCanvasId ?? ""}
          onChange={(event) =>
            setSelectedCanvasId(event.target.value as Id<"canvases">)
          }
          aria-label="Select a canvas"
        >
          {ownedCanvases.map((owned) => (
            <option key={owned._id} value={owned._id}>
              {owned.name} ({owned.nodeCount} node
              {owned.nodeCount === 1 ? "" : "s"})
            </option>
          ))}
        </select>
        {selectedCanvasId && (
          <Button variant="ghost" size="sm" asChild>
            <Link
              to="/canvas/$canvasId"
              params={{ canvasId: selectedCanvasId }}
            >
              Open canvas
            </Link>
          </Button>
        )}
      </div>

      {canvas === undefined ? (
        <div className="flex items-center gap-2 rounded-md border border-gray-200 bg-white p-4 text-sm text-muted-foreground">
          <Spinner /> Loading background…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <div className="space-y-4 rounded-md border border-gray-200 bg-white p-4">
            <div className="space-y-2">
              <Label>Background color</Label>
              <div className="flex flex-wrap items-center gap-2">
                {CANVAS_BG_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    title={preset}
                    aria-label={`Use ${preset} as background`}
                    onClick={() => setDraft((d) => ({ ...d, bgColor: preset }))}
                    className={cn(
                      "h-7 w-7 rounded-full border border-gray-300",
                      draft.bgColor.toLowerCase() === preset.toLowerCase() &&
                        "ring-2 ring-gray-900 ring-offset-2",
                    )}
                    style={{ backgroundColor: preset }}
                  />
                ))}
                <input
                  type="color"
                  value={draft.bgColor}
                  onChange={(event) =>
                    setDraft((d) => ({ ...d, bgColor: event.target.value }))
                  }
                  aria-label="Custom background color"
                  className="h-7 w-10 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
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
                    variant={
                      draft.variant === option.value ? "default" : "outline"
                    }
                    size="sm"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        variant: option.value,
                        // Taille sensée pour le nouveau motif, sinon un
                        // lineWidth de 0.3 donne des points invisibles.
                        size:
                          option.value === "none"
                            ? d.size
                            : VARIANT_DEFAULT_SIZE[option.value],
                      }))
                    }
                  >
                    {option.label}
                  </Button>
                ))}
              </div>
            </div>

            {draft.variant !== "none" && (
              <>
                <div className="space-y-2">
                  <Label>Pattern color</Label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={draft.patternColor}
                      onChange={(event) =>
                        setDraft((d) => ({
                          ...d,
                          patternColor: event.target.value,
                        }))
                      }
                      aria-label="Custom pattern color"
                      className="h-7 w-10 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                    />
                    <span className="text-xs text-gray-500">
                      {draft.patternColor}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="canvas-background-gap">
                    Spacing ({Math.round(draft.gap)}px)
                  </Label>
                  <input
                    id="canvas-background-gap"
                    type="range"
                    min={8}
                    max={80}
                    step={1}
                    value={draft.gap}
                    onChange={(event) =>
                      setDraft((d) => ({
                        ...d,
                        gap: Number(event.target.value),
                      }))
                    }
                    className="w-full"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="canvas-background-size">
                    {draft.variant === "lines" ? "Line width" : "Dot size"} (
                    {draft.variant === "lines"
                      ? (Math.round(draft.size * 10) / 10).toFixed(1)
                      : draft.size}
                    )
                  </Label>
                  <input
                    id="canvas-background-size"
                    type="range"
                    min={0.2}
                    max={12}
                    step={draft.variant === "lines" ? 0.1 : 0.5}
                    value={draft.size}
                    onChange={(event) =>
                      setDraft((d) => ({
                        ...d,
                        size: Number(event.target.value),
                      }))
                    }
                    className="w-full"
                  />
                </div>
              </>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                onClick={handleSave}
                disabled={!isDirty || isSaving}
              >
                {isSaving ? "Saving…" : "Save background"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={handleReset}
                disabled={isSaving}
              >
                Reset to default
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Preview</Label>
            <div
              className="h-44 rounded-md border border-gray-200"
              style={previewStyle(draft)}
              aria-label="Background preview"
            />
            <p className="text-xs text-gray-500">
              Shared with everyone who can see this canvas.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
