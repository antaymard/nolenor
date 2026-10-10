import { useEffect, useState, type ReactNode } from "react";
import toast from "react-hot-toast";
import { useMutation, useQuery } from "convex/react";
import { TbPlayerPlay } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Switch } from "@/components/shadcn/switch";
import { Textarea } from "@/components/shadcn/textarea";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import { toastError } from "@/components/utils/errorUtils";
import RecipeRuns from "./RecipeRuns";
import TriggersEditor from "./TriggersEditor";
import { formatDateTime, type RecipeTrigger } from "./recipeTriggers";

type Draft = {
  name: string;
  instructions: string;
  canvasId: Id<"canvases"> | "";
  triggers: RecipeTrigger[];
  enabled: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  instructions: "",
  canvasId: "",
  triggers: [],
  enabled: true,
};

type RecipeEditorProps =
  | { recipeId: Id<"recipes">; onDeleted: () => void }
  | {
      recipeId?: undefined;
      onCreated: (recipeId: Id<"recipes">) => void;
      /** Le canvas pré-choisi d'une recipe neuve (réglages ouverts depuis lui). */
      defaultCanvasId?: Id<"canvases">;
    };

/**
 * L'éditeur d'une recipe, neuve ou existante. Le formulaire est un brouillon
 * local, envoyé en entier à l'enregistrement ; l'interrupteur actif/inactif
 * d'une recipe existante, lui, s'applique tout de suite.
 */
export default function RecipeEditor(props: RecipeEditorProps) {
  const { recipeId } = props;
  const recipe = useQuery(api.recipes.get, recipeId ? { recipeId } : "skip");
  const canvases = useQuery(api.canvases.listUserCanvases);
  const createRecipe = useMutation(api.recipes.create);
  const updateRecipe = useMutation(api.recipes.update);
  const setEnabled = useMutation(api.recipes.setEnabled);
  const removeRecipe = useMutation(api.recipes.remove);
  const launchRecipe = useMutation(api.recipes.launch);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<"save" | "run" | null>(null);

  const defaultCanvasId =
    "defaultCanvasId" in props ? props.defaultCanvasId : undefined;
  const hydrationKey = recipeId ?? "draft";
  useEffect(() => {
    if (hydratedFor === hydrationKey) return;
    if (!recipeId) {
      setDraft({ ...EMPTY_DRAFT, canvasId: defaultCanvasId ?? "" });
      setHydratedFor("draft");
    } else if (recipe) {
      setDraft({
        name: recipe.name,
        instructions: recipe.instructions,
        canvasId: recipe.canvasId,
        triggers: recipe.triggers,
        enabled: recipe.enabled,
      });
      setHydratedFor(recipe._id);
    }
  }, [recipeId, recipe, hydratedFor, hydrationKey, defaultCanvasId]);

  if (recipeId && recipe === undefined) {
    return <Centered>Loading…</Centered>;
  }
  if (recipeId && recipe === null) {
    return <Centered>Recipe not found.</Centered>;
  }
  if (hydratedFor !== hydrationKey) return <Centered>Loading…</Centered>;

  // Nolë écrit dans le canvas cible : seuls ceux qu'on peut éditer. Celui de
  // la recipe reste affiché même si on a perdu ce droit, pour le comprendre.
  const editableCanvases = (canvases ?? []).filter(
    (canvas) => canvas.permission !== "viewer" || canvas._id === draft.canvasId,
  );

  const dirty =
    !recipe ||
    recipe.name !== draft.name ||
    recipe.instructions !== draft.instructions ||
    recipe.canvasId !== draft.canvasId ||
    JSON.stringify(recipe.triggers) !== JSON.stringify(draft.triggers);

  const update = (patch: Partial<Draft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const handleSave = async () => {
    if (!draft.canvasId) {
      toast.error("Choose the canvas Nolë works on.");
      return;
    }
    const fields = { ...draft, canvasId: draft.canvasId };
    setBusy("save");
    try {
      if (props.recipeId) {
        await updateRecipe({
          recipeId: props.recipeId,
          ...fields,
          // L'interrupteur s'applique à part : on garde l'état en base.
          enabled: recipe?.enabled ?? draft.enabled,
        });
        toast.success("Recipe saved.");
      } else if ("onCreated" in props) {
        const id = await createRecipe(fields);
        toast.success("Recipe created.");
        props.onCreated(id);
      }
    } catch (error) {
      toastError(error, "Failed to save recipe.");
    } finally {
      setBusy(null);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    if (!props.recipeId) {
      update({ enabled });
      return;
    }
    try {
      await setEnabled({ recipeId: props.recipeId, enabled });
    } catch (error) {
      toastError(error, "Failed to update recipe.");
    }
  };

  const handleRun = async () => {
    if (!props.recipeId) return;
    setBusy("run");
    try {
      await launchRecipe({ recipeId: props.recipeId });
      toast.success("Nolë is on it.");
    } catch (error) {
      toastError(error, "Failed to run recipe.");
    } finally {
      setBusy(null);
    }
  };

  const handleDelete = async () => {
    if (!props.recipeId) return;
    try {
      await removeRecipe({ recipeId: props.recipeId });
      toast.success(`Recipe "${recipe?.name}" deleted.`);
      props.onDeleted();
    } catch (error) {
      toastError(error, "Failed to delete recipe.");
    }
  };

  const enabled = recipe ? recipe.enabled : draft.enabled;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto md:pr-2">
      {/* En-tête */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-xl font-bold break-words">
            {recipe?.name || draft.name || "New recipe"}
          </h2>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Switch checked={enabled} onCheckedChange={handleToggle} />
            {enabled ? "Active" : "Paused: no trigger will run it"}
          </label>
          {recipe?.nextRunAt !== undefined && (
            <p className="text-sm text-slate-500">
              Next run: {formatDateTime(recipe.nextRunAt)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {recipe && (
            <ConfirmableButton
              title={`Delete recipe "${recipe.name}"?`}
              text="Its past runs stay in their conversations. This cannot be undone."
              confirmLabel="Delete recipe"
              destructive
              onConfirm={() => void handleDelete()}
            >
              <Button
                type="button"
                variant="outline"
                className="text-red-600 hover:text-red-700"
              >
                Delete
              </Button>
            </ConfirmableButton>
          )}
          {recipe && (
            <Button
              type="button"
              variant="outline"
              onClick={handleRun}
              disabled={busy !== null || dirty}
              title={dirty ? "Save your changes first" : undefined}
            >
              <TbPlayerPlay />
              {busy === "run" ? "Starting…" : "Run now"}
            </Button>
          )}
          <Button
            type="button"
            onClick={handleSave}
            disabled={busy !== null || !dirty}
          >
            {busy === "save" ? "Saving…" : recipe ? "Save" : "Create"}
          </Button>
        </div>
      </div>

      <Field label="Name" htmlFor="recipe-name">
        <Input
          id="recipe-name"
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="e.g. Morning apartment listings"
        />
      </Field>

      <Field
        label="Canvas"
        hint="Where Nolë works when the recipe runs. You need to be an editor."
      >
        <Select
          value={draft.canvasId}
          onValueChange={(value) =>
            update({ canvasId: value as Id<"canvases"> })
          }
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Choose a canvas" />
          </SelectTrigger>
          <SelectContent>
            {editableCanvases.map((canvas) => (
              <SelectItem key={canvas._id} value={canvas._id}>
                {canvas.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        label="Instructions"
        htmlFor="recipe-instructions"
        hint="Sent to Nolë as a message, in a new conversation each time. Name the nodes it should read or update."
      >
        <Textarea
          id="recipe-instructions"
          value={draft.instructions}
          onChange={(e) => update({ instructions: e.target.value })}
          placeholder="Check the new listings on these sites and add the ones matching my criteria to the table."
          className="min-h-40"
        />
      </Field>

      <Field label="Triggers">
        <TriggersEditor
          triggers={draft.triggers}
          onChange={(triggers) => update({ triggers })}
        />
      </Field>

      {recipe && (
        <Field label="Runs">
          <RecipeRuns recipeId={recipe._id} />
        </Field>
      )}
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="font-semibold text-slate-700">
        {label}
      </Label>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-slate-500">
      {children}
    </div>
  );
}
