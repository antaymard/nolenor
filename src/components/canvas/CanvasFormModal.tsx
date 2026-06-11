import { useForm, useStore } from "@tanstack/react-form";
import TextInput from "@/components/ts-form/TextInput";
import toast from "react-hot-toast";
import { useMutation } from "convex/react";
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

interface CanvasFormModalProps {
  mode: "create" | "edit";
  canvasId?: Id<"canvases">;
  initialValues?: { name: string; description: string };
  onSuccess?: () => void;
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

  const defaults = initialValues ?? { name: "", description: "" };

  const form = useForm({
    defaultValues: defaults,
    onSubmit: async ({ value }) => {
      try {
        if (mode === "edit") {
          if (!canvasId) {
            throw new Error("Missing canvasId for edit.");
          }
          await updateCanvasDetails({
            canvasId,
            name: value.name,
            description: value.description,
          });
          toast.success(`Workspace "${value.name}" updated successfully!`);
          onSuccess?.();
        } else {
          const newCanvasId = await createCanvas({
            name: value.name,
            description: value.description,
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
    <DialogContent>
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
              ? "Update the name and description."
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
            label="Description"
            placeholder="Canvas description. Helps the assistant to understand the context of the canvas."
            validators={{
              onChange: ({ value }: { value: string }) =>
                !value.trim() ? "Description cannot be empty" : undefined,
              onSubmit: ({ value }: { value: string }) =>
                !value.trim() ? "Description cannot be empty" : undefined,
            }}
          />
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
