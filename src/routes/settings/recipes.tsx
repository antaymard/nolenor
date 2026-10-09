import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { TbArrowLeft, TbPlus } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import PageHeader from "@/components/app-shell/PageHeader";
import { Button } from "@/components/shadcn/button";
import RecipeEditor from "@/components/settings/recipes/RecipeEditor";
import RecipesList from "@/components/settings/recipes/RecipesList";
import { guardDevOnlySettingsRoute } from "@/lib/featureFlags";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/settings/recipes")({
  beforeLoad: guardDevOnlySettingsRoute,
  component: RecipesSettingsPage,
});

/** Liste à gauche, éditeur à droite : la même mise en page que les skills. */
function RecipesSettingsPage() {
  const recipes = useQuery(api.recipes.list);
  const [selectedId, setSelectedId] = useState<Id<"recipes"> | null>(null);
  const [isDraft, setIsDraft] = useState(false);

  const isEditing = isDraft || selectedId !== null;
  const closeEditor = () => {
    setIsDraft(false);
    setSelectedId(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <PageHeader
        title="Recipes"
        subtitle="Tasks for Nolë that you run on demand, on a schedule, or once at a given date. Each run is a new conversation on the recipe's canvas."
        action={
          <Button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setIsDraft(true);
            }}
          >
            <TbPlus />
            New recipe
          </Button>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 md:grid md:grid-cols-[320px_1fr] md:gap-6">
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto pr-1",
            isEditing && "hidden md:block",
          )}
        >
          {recipes === undefined ? (
            <p className="px-2 text-sm text-slate-500 italic">Loading…</p>
          ) : (
            <RecipesList
              recipes={recipes}
              selectedId={selectedId}
              onSelect={(id) => {
                setIsDraft(false);
                setSelectedId(id);
              }}
            />
          )}
        </div>

        <div
          className={cn(
            "flex min-h-0 flex-1 flex-col gap-3 md:border-l md:border-slate-200 md:pl-6",
            !isEditing && "hidden md:flex",
          )}
        >
          {isEditing && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start md:hidden"
              onClick={closeEditor}
            >
              <TbArrowLeft /> All recipes
            </Button>
          )}
          <div className="min-h-0 flex-1">
            {selectedId ? (
              <RecipeEditor
                key={selectedId}
                recipeId={selectedId}
                onDeleted={closeEditor}
              />
            ) : isDraft ? (
              <RecipeEditor
                key="draft"
                onCreated={(id) => {
                  setIsDraft(false);
                  setSelectedId(id);
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Select a recipe on the left, or create a new one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
