import { Button } from "@/components/shadcn/button";
import type { Id } from "@/../convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import toast from "react-hot-toast";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import TextInput from "@/components/ts-form/TextInput";

export const Route = createFileRoute("/settings/recipes/edit/$recipeId")({
  component: RouteComponent,
});

function RouteComponent() {
  const upsertRecipe = useMutation(api.recipes.upsert);
  const navigate = useNavigate();
  const { recipeId } = Route.useParams();

  const form = useForm({
    defaultValues: {
      name: "",
      content: "",
    },
    validators: {
      onChange({ value }) {
        if (!value.name) {
          return "Recipe name is required";
        }
        if (!value.content) {
          return "Recipe content is required";
        }
        return undefined;
      },
    },
    onSubmit: async ({ value }) => {
      try {
        const values = {
          ...value,
          operation: recipeId === "new" ? "create" : "update",
          recipeId:
            recipeId === "new" ? undefined : (recipeId as Id<"recipes">),
        } satisfies {
          name: string;
          content: string;
          recipeId?: Id<"recipes">;
          operation: "create" | "update";
        };
        await upsertRecipe(values);
        toast.success("Recipe saved");
        navigate({ to: "/settings/recipes" });
      } catch {
        toast.error("Failed to save recipe");
      }
      console.log(value);
    },
  });

  return (
    <form
      className="max-w-4xl mx-auto"
      onSubmit={(e) => {
        e.preventDefault();
        form.handleSubmit();
      }}
    >
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">New recipe</h1>
        <Button type="submit">Save</Button>
      </div>

      <div className="mt-8 bg-slate-50 rounded p-2 space-y-2 ">
        <TextInput
          form={form}
          name="name"
          label="Title"
          required
          inputClassName="bg-white"
        />
      </div>
    </form>
  );
}
