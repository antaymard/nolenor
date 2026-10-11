import { useState } from "react";
import { useQuery } from "convex/react";
import { TbArrowLeft, TbPlus } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import PageHeader from "@/components/app-shell/PageHeader";
import { Button } from "@/components/shadcn/button";
import RecipeEditor from "@/components/settings/recipes/RecipeEditor";
import RecipesList from "@/components/settings/recipes/RecipesList";
import { cn } from "@/lib/utils";
import type { SettingsPageProps } from "../settingsSections";

/**
 * Liste à gauche, éditeur à droite : la même mise en page que les skills.
 *
 * Ouverte depuis un canvas (`canvasId`), la liste ne montre d'abord que les
 * recipes de ce canvas, et une recipe neuve y est rattachée ; un bouton
 * bascule sur toutes.
 */
export default function RecipesSettingsPage({ canvasId }: SettingsPageProps) {
  const allRecipes = useQuery(api.recipes.list);
  const [selectedId, setSelectedId] = useState<Id<"recipes"> | null>(null);
  const [isDraft, setIsDraft] = useState(false);
  const [scope, setScope] = useState<"canvas" | "all">(
    canvasId ? "canvas" : "all",
  );

  const canvasRecipes = allRecipes?.filter(
    (recipe) => recipe.canvasId === canvasId,
  );
  const recipes = scope === "canvas" ? canvasRecipes : allRecipes;

  const isEditing = isDraft || selectedId !== null;
  const closeEditor = () => {
    setIsDraft(false);
    setSelectedId(null);
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <PageHeader
        title="Routines"
        subtitle="Tasks for Nolë that you run on demand, on a schedule, or once at a given date. Each run is a new conversation on the routine's canvas."
        action={
          <Button
            type="button"
            onClick={() => {
              setSelectedId(null);
              setIsDraft(true);
            }}
          >
            <TbPlus />
            New routine
          </Button>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 md:grid md:grid-cols-[320px_minmax(0,1fr)] md:gap-6">
        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto pr-1",
            isEditing && "hidden md:block",
          )}
        >
          {canvasId && allRecipes && (
            <div
              role="group"
              aria-label="Routines to show"
              className="mb-3 flex gap-1 rounded-lg bg-slate-100 p-1 text-sm"
            >
              {(
                [
                  ["canvas", "This canvas", canvasRecipes?.length ?? 0],
                  ["all", "All", allRecipes.length],
                ] as const
              ).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={scope === value}
                  onClick={() => setScope(value)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1 transition-colors",
                    scope === value
                      ? "bg-surface font-medium text-slate-900 shadow-xs"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {label} <span className="text-slate-400">{count}</span>
                </button>
              ))}
            </div>
          )}
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
            "flex min-h-0 min-w-0 flex-1 flex-col gap-3 md:border-l md:border-slate-200 md:pl-6",
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
              <TbArrowLeft /> All routines
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
                defaultCanvasId={canvasId}
                onCreated={(id) => {
                  setIsDraft(false);
                  setSelectedId(id);
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Select a routine on the left, or create a new one.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
