import { useForm } from "@tanstack/react-form";
import TextInput from "@/components/ts-form/TextInput";
import toast from "react-hot-toast";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
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

export default function CanvasCreationModal() {
  const createCanvas = useMutation(api.canvases.createCanvas);
  const navigate = useNavigate();

  const form = useForm({
    defaultValues: { name: "", description: "" },
    onSubmit: async ({ value }) => {
      if (!value.name.trim()) return;
      try {
        const newCanvasId = await createCanvas({
          name: value.name,
          description: value.description,
        });
        if (newCanvasId) {
          toast.success(`Workspace "${value.name}" created successfully!`);
          navigate({
            to: `/canvas/${newCanvasId}`,
            params: { canvasId: newCanvasId },
          });
        } else {
          throw new Error("Failed to create workspace.");
        }
      } catch (error) {
        toastError(error, "Error while creating workspace.");
      }
    },
  });

  return (
    <DialogContent>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          form.handleSubmit();
        }}
      >
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
          <DialogDescription>Give this new workspace a name.</DialogDescription>
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
            }}
          />
          <TextArea
            form={form}
            name="description"
            label="Description"
            placeholder="Canvas description. Helps the assistant to understand the context of the canvas."
            validators={{
              onChange: ({ value }: { value: string }) =>
                !value.trim() ? "Name cannot be empty" : undefined,
            }}
          />
        </div>
        <DialogFooter>
          <Button type="submit">Create</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
