import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Link } from "@tanstack/react-router";
import { TbChevronDown, TbExclamationCircle } from "react-icons/tb";
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
import { CANVAS_COVERS, canvasCover } from "@/lib/canvasCover";
import { cn } from "@/lib/utils";
import CanvasBackgroundField from "./CanvasBackgroundField";
import { CanvasCoverField, CanvasIdentityField } from "./CanvasAppearanceField";
import {
  coverDraftFrom,
  isCoverDraftDirty,
  useCanvasCoverUpload,
  type CanvasCoverDraft,
  type CanvasIdentityDraft,
} from "./canvasAppearanceDraft";

export default function CanvasBackgroundPanel({
  initialCanvasId,
}: {
  initialCanvasId?: string;
}) {
  const canvases = useQuery(api.canvases.listUserCanvases);
  const updateBackground = useMutation(api.canvases.updateCanvasBackground);
  const updateAppearance = useMutation(api.canvases.updateCanvasAppearance);
  const resolveCoverForSave = useCanvasCoverUpload();
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

  const loadedCanvas = canvas ?? undefined;
  const serverIcon: string | undefined = loadedCanvas?.icon;
  const serverColor: CanvasIdentityDraft["color"] = loadedCanvas?.color;
  const serverCover: { url: string; key: string } | undefined =
    loadedCanvas?.coverImage;

  const [identityDraft, setIdentityDraft] = useState<CanvasIdentityDraft>({});
  const [coverDraft, setCoverDraft] = useState<CanvasCoverDraft>({
    kind: "none",
  });
  const [coverOpen, setCoverOpen] = useState(false);

  // Même resync que le fond : au changement de canvas comme à chaque réponse
  // du serveur — deux canvas sans icône ne doivent pas se passer le brouillon.
  useEffect(() => {
    setIdentityDraft({ icon: serverIcon, color: serverColor });
    setCoverDraft(coverDraftFrom(serverCover));
    // `canvas` suffit : les trois valeurs en dérivent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas]);

  if (canvases === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-muted-foreground">
        <Spinner /> Loading your canvases…
      </div>
    );
  }

  if (ownedCanvases.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        <TbExclamationCircle /> You have no canvas yet — create one first, then
        come back to style its background.
      </div>
    );
  }

  const isBackgroundDirty =
    draft.bgColor !== serverBackground.bgColor ||
    draft.patternColor !== serverBackground.patternColor ||
    draft.variant !== serverBackground.variant ||
    draft.gap !== serverBackground.gap ||
    draft.size !== serverBackground.size;
  const isIconDirty = identityDraft.icon !== serverIcon;
  const isColorDirty = identityDraft.color !== serverColor;
  const isCoverDirty = isCoverDraftDirty(coverDraft, serverCover);
  const isDirty =
    isBackgroundDirty || isIconDirty || isColorDirty || isCoverDirty;

  const selectedCanvas = ownedCanvases.find(
    (owned) => owned._id === selectedCanvasId,
  );
  const coverTint = identityDraft.color
    ? CANVAS_COVERS[identityDraft.color].tint
    : selectedCanvasId
      ? canvasCover(selectedCanvasId).tint
      : CANVAS_COVERS.slate.tint;

  const handleSave = async () => {
    if (!selectedCanvasId || !isDirty) return;
    setIsSaving(true);
    try {
      if (isIconDirty || isColorDirty || isCoverDirty) {
        const coverImage = await resolveCoverForSave(coverDraft, serverCover);
        await updateAppearance({
          canvasId: selectedCanvasId,
          ...(isIconDirty ? { icon: identityDraft.icon ?? null } : {}),
          ...(isColorDirty ? { color: identityDraft.color ?? null } : {}),
          ...(coverImage !== undefined ? { coverImage } : {}),
        });
      }
      if (isBackgroundDirty) {
        await updateBackground({
          canvasId: selectedCanvasId,
          background: sanitizeCanvasBackgroundForSave(draft),
        });
      }
      toast.success("Canvas updated — visible to everyone.");
    } catch (error) {
      toastError(error, "Could not update the canvas.");
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
          className="block w-full max-w-md rounded-lg border border-slate-300 bg-white p-2 text-sm"
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
        <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm text-muted-foreground">
          <Spinner /> Loading canvas…
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <CanvasIdentityField
              canvasId={selectedCanvasId ?? undefined}
              name={selectedCanvas?.name ?? ""}
              value={identityDraft}
              onChange={setIdentityDraft}
              disabled={isSaving}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              aria-expanded={coverOpen}
              onClick={() => setCoverOpen((prev) => !prev)}
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <span className="text-sm font-medium">
                Cover image
                <span className="ml-2 font-normal text-muted-foreground">
                  {coverDraft.kind === "none" ? "None" : "Set"}
                </span>
              </span>
              <TbChevronDown
                size={16}
                className={cn(
                  "shrink-0 text-slate-500 transition-transform",
                  coverOpen && "rotate-180",
                )}
              />
            </button>
            {coverOpen && (
              <div className="space-y-2 border-t border-slate-200 p-4">
                <p className="text-xs text-muted-foreground">
                  Shown on the canvas card on the home page.
                </p>
                <CanvasCoverField
                  value={coverDraft}
                  onChange={setCoverDraft}
                  tintClassName={coverTint}
                  disabled={isSaving}
                />
              </div>
            )}
          </div>

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
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleReset}
              disabled={isSaving}
            >
              Reset background
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
