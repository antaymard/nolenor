import { useEffect, useMemo, useState } from "react";
import { useForm, useStore } from "@tanstack/react-form";
import TextInput from "@/components/ts-form/TextInput";
import toast from "react-hot-toast";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNavigate } from "@tanstack/react-router";
import { toastError } from "../utils/errorUtils";
import {
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/shadcn/button";
import TextArea from "../ts-form/TextArea";
import CanvasBackgroundField from "@/components/settings/canvas/CanvasBackgroundField";
import {
  DEFAULT_CANVAS_BACKGROUND,
  resolveCanvasBackground,
  sanitizeCanvasBackgroundForSave,
  type CanvasBackground,
  type ResolvedCanvasBackground,
} from "@/lib/canvasBackground";

interface CanvasFormModalProps {
  mode: "create" | "edit";
  canvasId?: Id<"canvases">;
  initialValues?: {
    name: string;
    description?: string;
    background?: CanvasBackground;
  };
  onSuccess?: () => void;
}

function isDefaultBackground(draft: ResolvedCanvasBackground) {
  return (
    draft.bgColor === DEFAULT_CANVAS_BACKGROUND.bgColor &&
    draft.patternColor === DEFAULT_CANVAS_BACKGROUND.patternColor &&
    draft.variant === DEFAULT_CANVAS_BACKGROUND.variant &&
    draft.gap === DEFAULT_CANVAS_BACKGROUND.gap &&
    draft.size === DEFAULT_CANVAS_BACKGROUND.size
  );
}

export default function CanvasFormModal({
  mode,
  canvasId,
  initialValues,
  onSuccess,
}: CanvasFormModalProps) {
  const createCanvas = useMutation(api.canvases.createCanvas);
  const updateCanvasDetails = useMutation(api.canvases.updateCanvasDetails);
  const navigate = useNavigate();

  const defaults = {
    name: initialValues?.name ?? "",
    description: initialValues?.description ?? "",
  };

  // Background contrôlé localement, hors tanstack-form : `undefined` tant que
  // l'utilisateur ne touche à rien → on n'envoie rien (défaut front).
  const [backgroundDraft, setBackgroundDraft] =
    useState<ResolvedCanvasBackground>(() =>
      resolveCanvasBackground(initialValues?.background),
    );
  const [backgroundTouched, setBackgroundTouched] = useState(false);

  // En edit sans background fourni par l'appelant, on hydrate depuis le
  // serveur sans marquer "touched" (sinon on écraserait au save).
  const editCanvas = useQuery(
    api.canvases.readCanvas,
    mode === "edit" && canvasId && initialValues?.background === undefined
      ? { canvasId }
      : "skip",
  );
  const serverBackground = useMemo<ResolvedCanvasBackground | undefined>(() => {
    if (initialValues?.background !== undefined) {
      return resolveCanvasBackground(initialValues.background);
    }
    if (mode === "edit" && editCanvas !== undefined && editCanvas !== null) {
      return resolveCanvasBackground(editCanvas.background ?? undefined);
    }
    return undefined;
  }, [initialValues?.background, mode, editCanvas]);

  useEffect(() => {
    if (!backgroundTouched && serverBackground !== undefined) {
      setBackgroundDraft(serverBackground);
    }
  }, [serverBackground, backgroundTouched]);

  const isBackgroundDirty =
    mode === "create"
      ? backgroundTouched && !isDefaultBackground(backgroundDraft)
      : serverBackground !== undefined
        ? backgroundTouched &&
          (backgroundDraft.bgColor !== serverBackground.bgColor ||
            backgroundDraft.patternColor !== serverBackground.patternColor ||
            backgroundDraft.variant !== serverBackground.variant ||
            backgroundDraft.gap !== serverBackground.gap ||
            backgroundDraft.size !== serverBackground.size)
        : backgroundTouched && !isDefaultBackground(backgroundDraft);

  const editBackgroundLoading =
    mode === "edit" &&
    canvasId &&
    initialValues?.background === undefined &&
    editCanvas === undefined;

  const form = useForm({
    defaultValues: defaults,
    onSubmit: async ({ value }) => {
      try {
        const description = value.description?.trim()
          ? value.description.trim()
          : undefined;
        const background = isBackgroundDirty
          ? sanitizeCanvasBackgroundForSave(backgroundDraft)
          : undefined;
        if (mode === "edit") {
          if (!canvasId) {
            throw new Error("Missing canvasId for edit.");
          }
          await updateCanvasDetails({
            canvasId,
            name: value.name,
            description,
            ...(background !== undefined ? { background } : {}),
          });
          toast.success(`Workspace "${value.name}" updated successfully!`);
          onSuccess?.();
        } else {
          const newCanvasId = await createCanvas({
            name: value.name,
            description,
            ...(background !== undefined ? { background } : {}),
          });
          if (newCanvasId) {
            toast.success(
              `Workspace "${value.name}" created successfully!`,
            );
            navigate({
              to: `/canvas/${newCanvasId}`,
              params: { canvasId: newCanvasId },
            });
          } else {
            throw new Error("Failed to create workspace.");
          }
        }
      } catch (error) {
        toastError(
          error,
          mode === "edit"
            ? "Error while updating workspace."
            : "Error while creating workspace.",
        );
      }
    },
  });

  const isEdit = mode === "edit";
  const isSubmitting = useStore(form.store, (s) => s.isSubmitting);

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit workspace" : "Create a workspace"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the name, description and background."
              : "Give this new workspace a name."}
          </DialogDescription>
        </DialogHeader>
        <div className="my-3 space-y-3">
          <TextInput
            form={form}
            name="name"
            label="Workspace name"
            placeholder="Canvas name"
            validators={{
              onChange: ({ value }: { value: string }) =>
                !value.trim() ? "Name cannot be empty" : undefined,
              onSubmit: ({ value }: { value: string }) =>
                !value.trim() ? "Name cannot be empty" : undefined,
            }}
          />
          <TextArea
            form={form}
            name="description"
            label="Description (optional)"
            placeholder="Canvas description. Helps the assistant to understand the context of the canvas."
          />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Background (optional)
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={isSubmitting || editBackgroundLoading}
                onClick={() => {
                  setBackgroundDraft(DEFAULT_CANVAS_BACKGROUND);
                  setBackgroundTouched(true);
                }}
              >
                Reset to default
              </Button>
            </div>
            {editBackgroundLoading ? (
              <p className="text-xs text-muted-foreground">
                Loading background…
              </p>
            ) : (
              <CanvasBackgroundField
                compact
                hideHint
                value={backgroundDraft}
                disabled={isSubmitting}
                onChange={(next) => {
                  setBackgroundDraft(next);
                  setBackgroundTouched(true);
                }}
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting
              ? (isEdit ? "Saving..." : "Creating...")
              : (isEdit ? "Save" : "Create")}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
