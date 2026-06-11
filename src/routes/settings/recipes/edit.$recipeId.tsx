import { Button } from "@/components/shadcn/button";
import type { Id } from "@/../convex/_generated/dataModel";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "@tanstack/react-form";
import toast from "react-hot-toast";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import TextInput from "@/components/ts-form/TextInput";

import "@blocknote/core/fonts/inter.css";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { Block, BlockNoteEditor, PartialBlock } from "@blocknote/core";
import "@blocknote/shadcn/style.css";
import { useMemo, useEffect } from "react";
import useRichQuery from "@/components/utils/useRichQuery";
import { cn } from "@udecode/cn";

export const Route = createFileRoute("/settings/recipes/edit/$recipeId")({
  component: RouteComponent,
});

function RouteComponent() {
  const upsertRecipe = useMutation(api.recipes.upsert);
  const navigate = useNavigate();
  const { recipeId } = Route.useParams();

  const { data: recipe, isSuccess } = useRichQuery(
    api.recipes.read,
    recipeId === "new" ? "skip" : { recipeId: recipeId as Id<"recipes"> },
  );

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

  useEffect(() => {
    if (isSuccess && recipe && recipeId !== "new") {
      form.setFieldValue("name", recipe.name);
      form.setFieldValue("content", recipe.content);
    }
  }, [recipe, isSuccess, recipeId]);

  const editor = useMemo(() => {
    if (recipeId === "new") {
      return BlockNoteEditor.create();
    }
    if (isSuccess && recipe) {
      return BlockNoteEditor.create({
        initialContent: recipe.content
          ? (JSON.parse(recipe.content) as PartialBlock[])
          : undefined,
      });
    }
  }, [recipeId, isSuccess, recipe]);

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">New recipe</h1>
        <Button onClick={() => form.handleSubmit()}>Save</Button>
      </div>

      <div className="mt-8 bg-slate-50 rounded p-2 space-y-2 ">
        <TextInput
          form={form}
          name="name"
          label="Title"
          required
          validators={{
            onChange: ({ value }: { value: string }) =>
              !value.trim() ? "Title cannot be empty" : undefined,
            onSubmit: ({ value }: { value: string }) =>
              !value.trim() ? "Title cannot be empty" : undefined,
          }}
          inputClassName="bg-white"
        />
        {editor ? (
          <form.Field
            name="content"
            validators={{
              onChange: ({ value }: { value: string }) =>
                !value ? "Recipe content is required" : undefined,
              onSubmit: ({ value }: { value: string }) =>
                !value ? "Recipe content is required" : undefined,
            }}
          >
            {(field) => {
              const errors = field.state.meta.errors;
              const hasError = errors.length > 0;

              return (
                <div className="flex flex-col gap-1.5 mt-4">
                  <label className="text-sm font-medium">Content</label>
                  <BlockNoteView
                    theme="light"
                    editor={editor}
                    className={cn(
                      hasError && "border border-destructive",
                      "rounded",
                    )}
                    onChange={() => {
                      field.handleChange(JSON.stringify(editor.document));
                    }}
                  />
                  {hasError && (
                    <span className="text-sm text-destructive">
                      {errors[0]}
                    </span>
                  )}
                </div>
              );
            }}
          </form.Field>
        ) : (
          <div>Loading editor...</div>
        )}
      </div>
    </div>
  );
}
