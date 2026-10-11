import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
import { Spinner } from "@/components/shadcn/spinner";
import { toastError } from "@/components/utils/errorUtils";
import toast from "react-hot-toast";
import { useSettingsModalStore } from "@/stores/settingsModalStore";
import { canvasCover } from "@/lib/canvasCover";
import CanvasBackgroundField from "./CanvasBackgroundField";
import { CanvasCoverField, CanvasIdentityField } from "./CanvasAppearanceField";
import CollapsibleSection from "./CollapsibleSection";
import {
  coverDraftFrom,
  isCoverDraftDirty,
  useCanvasCoverUpload,
  type CanvasCoverDraft,
  type CanvasIdentityDraft,
} from "./canvasAppearanceDraft";

/**
 * L'apparence du canvas ouvert : icône, couleur, couverture, fond. Toujours
 * celui-là, sans choix d'un autre : les réglages sont ouverts depuis lui.
 */
export default function CanvasBackgroundPanel({
  canvasId,
}: {
  canvasId: Id<"canvases">;
}) {
  const updateBackground = useMutation(api.canvases.updateCanvasBackground);
  const updateAppearance = useMutation(api.canvases.updateCanvasAppearance);
  const resolveCoverForSave = useCanvasCoverUpload();
  const [isSaving, setIsSaving] = useState(false);

  const canvas = useQuery(api.canvases.readCanvas, { canvasId });
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

  // Le brouillon s'affiche sur le canvas, derrière la modale, tant qu'il
  // diffère du fond enregistré (cf. `CanvasPeekButton`).
  const setBackgroundPreview = useSettingsModalStore(
    (state) => state.setBackgroundPreview,
  );
  useEffect(() => {
    const dirty = (Object.keys(draft) as (keyof typeof draft)[]).some(
      (key) => draft[key] !== serverBackground[key],
    );
    setBackgroundPreview(dirty ? sanitizeCanvasBackgroundForSave(draft) : null);
  }, [draft, serverBackground, setBackgroundPreview]);
  useEffect(() => () => setBackgroundPreview(null), [setBackgroundPreview]);

  const loadedCanvas = canvas ?? undefined;
  const serverIcon: string | undefined = loadedCanvas?.icon;
  const serverColor: CanvasIdentityDraft["color"] = loadedCanvas?.color;
  const serverCover: { url: string; key: string } | undefined =
    loadedCanvas?.coverImage;

  const [identityDraft, setIdentityDraft] = useState<CanvasIdentityDraft>({});
  const [coverDraft, setCoverDraft] = useState<CanvasCoverDraft>({
    kind: "none",
  });
  // Couverture et fond dépliés à l'ouverture : la page ne sert qu'à ça, et
  // le coup d'œil sur le canvas suppose les réglages sous la main. Chacun se
  // replie de son côté.
  const [coverOpen, setCoverOpen] = useState(true);
  const [backgroundOpen, setBackgroundOpen] = useState(true);

  // Même resync que le fond : au changement de canvas comme à chaque réponse
  // du serveur — deux canvas sans icône ne doivent pas se passer le brouillon.
  useEffect(() => {
    setIdentityDraft({ icon: serverIcon, color: serverColor });
    setCoverDraft(coverDraftFrom(serverCover));
    // `canvas` suffit : les trois valeurs en dérivent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvas]);

  if (canvas === undefined) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-surface p-4 text-sm text-muted-foreground">
        <Spinner /> Loading canvas…
      </div>
    );
  }

  // La mutation exige "owner" côté serveur de toute façon.
  if (canvas === null || canvas._permission !== "owner") {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-surface p-4 text-sm text-slate-500">
        <TbExclamationCircle /> Only the owner of this canvas can change its
        appearance.
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

  const coverTint = canvasCover(identityDraft.color).tint;

  const handleSave = async () => {
    if (!isDirty) return;
    setIsSaving(true);
    try {
      if (isIconDirty || isColorDirty || isCoverDirty) {
        const coverImage = await resolveCoverForSave(coverDraft, serverCover);
        await updateAppearance({
          canvasId,
          ...(isIconDirty ? { icon: identityDraft.icon ?? null } : {}),
          ...(isColorDirty ? { color: identityDraft.color ?? null } : {}),
          ...(coverImage !== undefined ? { coverImage } : {}),
        });
      }
      if (isBackgroundDirty) {
        await updateBackground({
          canvasId,
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
      <div className="space-y-3">
        <div className="rounded-xl border border-slate-200 bg-surface p-4">
          <CanvasIdentityField
            name={canvas.name ?? ""}
            value={identityDraft}
            onChange={setIdentityDraft}
            disabled={isSaving}
          />
        </div>

        <CollapsibleSection
          title="Cover image"
          summary={coverDraft.kind === "none" ? "None" : "Set"}
          className="rounded-xl border-slate-200 bg-surface"
          open={coverOpen}
          onToggle={() => setCoverOpen((prev) => !prev)}
        >
          <p className="text-xs text-muted-foreground">
            Shown on the canvas card on the home page.
          </p>
          <CanvasCoverField
            value={coverDraft}
            onChange={setCoverDraft}
            tintClassName={coverTint}
            disabled={isSaving}
          />
        </CollapsibleSection>

        <CollapsibleSection
          title="Background"
          className="rounded-xl border-slate-200 bg-surface"
          open={backgroundOpen}
          onToggle={() => setBackgroundOpen((prev) => !prev)}
        >
          <CanvasBackgroundField
            value={draft}
            onChange={setDraft}
            disabled={isSaving}
          />
        </CollapsibleSection>

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
    </div>
  );
}
