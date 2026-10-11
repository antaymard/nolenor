import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { describeSchedule } from "./recipeTriggers";

type RecipesListProps = {
  recipes: Doc<"recipes">[];
  selectedId: Id<"recipes"> | null;
  onSelect: (id: Id<"recipes">) => void;
};

export default function RecipesList({
  recipes,
  selectedId,
  onSelect,
}: RecipesListProps) {
  if (recipes.length === 0) {
    return (
      <p className="px-2 text-sm text-slate-500 italic">No routines yet.</p>
    );
  }

  return (
    <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-surface">
      {recipes.map((recipe) => (
        <button
          key={recipe._id}
          type="button"
          onClick={() => onSelect(recipe._id)}
          className={cn(
            "flex w-full flex-col gap-1 p-3 text-left transition-colors hover:bg-slate-100",
            selectedId === recipe._id && "bg-violet-50 hover:bg-violet-100",
          )}
        >
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "size-2 shrink-0 rounded-full",
                recipe.enabled ? "bg-emerald-500" : "bg-slate-300",
              )}
              aria-label={recipe.enabled ? "Active" : "Paused"}
            />
            <span className="truncate font-medium">{recipe.name}</span>
          </span>
          <span className="truncate text-sm text-slate-500">
            {recipe.enabled ? describeSchedule(recipe) : "Paused"}
          </span>
        </button>
      ))}
    </div>
  );
}
