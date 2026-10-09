import { Button } from "@/components/shadcn/button";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import toast from "react-hot-toast";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import TextInput from "@/components/ts-form/TextInput";
import TextArea from "@/components/ts-form/TextArea";
import { Label } from "@/components/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { useEffect } from "react";
import useRichQuery from "@/components/utils/useRichQuery";
import { guardDevOnlySettingsRoute } from "@/lib/featureFlags";

// Édition minimale d'une recipe : nom, instructions, canvas cible. Les
// déclencheurs et l'activation sont conservés tels quels (une recipe neuve
// est manuelle et active) ; leur édition viendra avec la page Recipes.

export const Route = createFileRoute("/settings/recipes/edit/$recipeId")({
  beforeLoad: guardDevOnlySettingsRoute,
  component: RouteComponent,
});

type Triggers = Doc<"recipes">["triggers"];

function RouteComponent() {
  const createRecipe = useMutation(api.recipes.create);
  const updateRecipe = useMutation(api.recipes.update);
  const navigate = useNavigate();
  const { recipeId } = Route.useParams();
  const isNew = recipeId === "new";

  const { data: recipe, isSuccess } = useRichQuery(
    api.recipes.get,
    isNew ? "skip" : { recipeId: recipeId as Id<"recipes"> },
  );
  const { data: canvases } = useRichQuery(api.canvases.listUserCanvases);
  // Nolë écrit dans le canvas cible : seuls ceux qu'on peut éditer.
  const editableCanvases = (canvases ?? []).filter(
    (canvas) => canvas.permission !== "viewer",
  );

  const form = useForm({
    defaultValues: {
      name: "",
      instructions: "",
      canvasId: "",
    },
    validators: {
      onChange({ value }) {
        if (!value.name) return "Recipe name is required";
        if (!value.canvasId) return "Target canvas is required";
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      const triggers: Triggers = recipe?.triggers ?? [{ kind: "manual" }];
      const fields = {
        name: value.name,
        instructions: value.instructions,
        canvasId: value.canvasId as Id<"canvases">,
        triggers,
        enabled: recipe?.enabled ?? true,
      };
      try {
        if (isNew) await createRecipe(fields);
        else
          await updateRecipe({
            recipeId: recipeId as Id<"recipes">,
            ...fields,
          });
        toast.success("Recipe saved");
        navigate({ to: "/settings/recipes" });
      } catch {
        toast.error("Failed to save recipe");
      }
    },
  });

  useEffect(() => {
    if (isSuccess && recipe && !isNew) {
      form.setFieldValue("name", recipe.name);
      form.setFieldValue("instructions", recipe.instructions);
      form.setFieldValue("canvasId", recipe.canvasId);
    }
  }, [recipe, isSuccess, isNew, form]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">
          {isNew ? "New recipe" : "Edit recipe"}
        </h1>
        <Button onClick={() => form.handleSubmit()}>Save</Button>
      </div>

      <div className="mt-8 bg-slate-50 rounded p-2 space-y-4">
        <TextInput
          form={form}
          name="name"
          label="Title"
          required
          validators={{
            onChange: ({ value }: { value: string }) =>
              !value.trim() ? "Title cannot be empty" : undefined,
          }}
          inputClassName="bg-surface"
        />
        <form.Field name="canvasId">
          {(field) => (
            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium">
                Canvas <span className="text-destructive">*</span>
              </Label>
              <Select
                value={field.state.value}
                onValueChange={(value) => field.handleChange(value)}
              >
                <SelectTrigger className="w-full bg-surface">
                  <SelectValue placeholder="Where Nolë works" />
                </SelectTrigger>
                <SelectContent>
                  {editableCanvases.map((canvas) => (
                    <SelectItem key={canvas._id} value={canvas._id}>
                      {canvas.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </form.Field>
        <TextArea
          form={form}
          name="instructions"
          label="Instructions"
          placeholder="What Nolë should do when this recipe runs"
          required
          minRows={6}
          validators={{
            onChange: ({ value }: { value: string }) =>
              !value.trim() ? "Instructions cannot be empty" : undefined,
          }}
        />
      </div>
    </div>
  );
}
