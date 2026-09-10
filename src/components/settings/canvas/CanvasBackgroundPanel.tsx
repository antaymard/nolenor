import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
import { TbExclamationCircle } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  DEFAULT_CANVAS_BACKGROUND,
  resolveCanvasBackground,
  sanitizeCanvasBackgroundForSave,
  type ResolvedCanvasBackground,
} from "@/lib/canvasBackground";
import { Button } from "@/components/shadcn/button";
import { Label } from "@/components/shadcn/label";
import { Spinner } from "@/components/shadcn/spinner";
import { toastError } from "@/components/utils/errorUtils";
import toast from "react-hot-toast";
import CanvasBackgroundField from "./CanvasBackgroundField";

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
        background: sanitizeCanvasBackgroundForSave(draft),
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
        <div className="space-y-3">
          <CanvasBackgroundField
            value={draft}
            onChange={setDraft}
            disabled={isSaving}
          />

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
      )}
    </div>
  );
}
