import { memo, useState } from "react";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import toast from "react-hot-toast";
import {
  TbChecklist,
  TbPencil,
  TbPlayerPlay,
  TbSettings,
} from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/shadcn/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import {
  describeSchedule,
  formatDateTime,
} from "@/components/settings/recipes/recipeTriggers";
import { toastError } from "@/components/utils/errorUtils";
import { useNodeDataValuesField } from "@/hooks/useNodeData";
import { useOpenNoleThread } from "@/hooks/useOpenNoleThread";
import { useUpdateNodeDataValues } from "@/hooks/useUpdateNodeDataValues";
import { cn } from "@/lib/utils";
import type { XyNodeProps } from "@/types/domain";
import { areNodePropsEqual } from "../areNodePropsEqual";
import NodeFrame from "../NodeFrame";
import CanvasNodeToolbar from "../toolbar/CanvasNodeToolbar";
import { NodeToolbarButton } from "../toolbar/NodeToolbarButton";

const RUN_STATUS: Record<
  Doc<"runs">["status"],
  { label: string; className: string }
> = {
  running: { label: "Running", className: "bg-blue-500 animate-pulse" },
  waiting: { label: "Needs an answer", className: "bg-amber-500" },
  idle: { label: "Done", className: "bg-emerald-500" },
  error: { label: "Failed", className: "bg-red-500" },
  aborted: { label: "Stopped", className: "bg-slate-400" },
};

/**
 * Le TaskNode : un raccourci vers une recipe. Il ne porte que `recipeId` ;
 * nom, déclencheurs et dernier run viennent de `recipes.forTaskNode`, qui ne
 * montre la recipe qu'aux membres du canvas qu'elle vise.
 */
function TaskNode(xyNode: XyNodeProps) {
  const { nodeDataId } = xyNode.data;
  const { canvasId } = useParams({ from: "/canvas/$canvasId" }) as {
    canvasId: Id<"canvases">;
  };
  const recipeId = useNodeDataValuesField<string>(nodeDataId, "recipeId") ?? "";
  const recipe = useQuery(
    api.recipes.forTaskNode,
    recipeId ? { recipeId, canvasId } : "skip",
  );
  const { updateNodeDataValues } = useUpdateNodeDataValues();
  const [pickerOpen, setPickerOpen] = useState(false);
  const navigate = useNavigate();

  const linkRecipe = (id: Id<"recipes">) => {
    if (!nodeDataId) return;
    void updateNodeDataValues({ nodeDataId, values: { recipeId: id } });
    setPickerOpen(false);
  };

  return (
    <>
      <CanvasNodeToolbar xyNode={xyNode}>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <NodeToolbarButton label="Recipe" title="Choose the recipe">
              <TbPencil />
            </NodeToolbarButton>
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <RecipePicker
              canvasId={canvasId}
              value={recipe?._id}
              onPick={linkRecipe}
            />
          </PopoverContent>
        </Popover>
        {recipe?.isOwner && (
          <NodeToolbarButton
            label="Settings"
            title="Edit in settings"
            onClick={() => void navigate({ to: "/settings/recipes" })}
          >
            <TbSettings />
          </NodeToolbarButton>
        )}
      </CanvasNodeToolbar>
      <NodeFrame xyNode={xyNode}>
        {!recipeId ? (
          <div className="flex h-full flex-col justify-center gap-2 p-3">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <TbChecklist className="shrink-0" /> Choose a recipe
            </span>
            <RecipePicker canvasId={canvasId} onPick={linkRecipe} />
          </div>
        ) : recipe === undefined ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Loading…
          </div>
        ) : recipe === null ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 p-3 text-center text-muted-foreground">
            <TbChecklist />
            <span className="text-sm">Recipe unavailable</span>
            <span className="text-xs">
              It was deleted, or it runs on another canvas.
            </span>
          </div>
        ) : (
          <LinkedTask recipe={recipe} />
        )}
      </NodeFrame>
    </>
  );
}

type TaskRecipe = NonNullable<
  FunctionReturnType<typeof api.recipes.forTaskNode>
>;

function LinkedTask({ recipe }: { recipe: TaskRecipe }) {
  const launch = useMutation(api.recipes.launch);
  const openThread = useOpenNoleThread();
  const [starting, setStarting] = useState(false);
  const running =
    recipe.lastRun?.status === "running" ||
    recipe.lastRun?.status === "waiting";

  const handleRun = async () => {
    setStarting(true);
    try {
      const { threadId } = await launch({ recipeId: recipe._id });
      toast.success("Nolë is on it.");
      openThread(threadId);
    } catch (error) {
      toastError(error, "Failed to run the recipe.");
    } finally {
      setStarting(false);
    }
  };

  const lastRun = recipe.lastRun;
  const status = lastRun ? RUN_STATUS[lastRun.status] : null;

  return (
    // `*:shrink-0` : à court de hauteur, les lignes ne s'écrasent pas, le
    // node coupe le bas.
    <div className="flex h-full flex-col gap-1 overflow-hidden p-3 *:shrink-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <TbChecklist className="shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">{recipe.name}</span>
      </div>
      <span className="truncate text-xs text-muted-foreground">
        {recipe.enabled ? describeSchedule(recipe) : "Paused"}
      </span>
      {recipe.enabled && recipe.nextRunAt !== undefined && (
        <span className="truncate text-xs text-muted-foreground">
          Next run {formatDateTime(recipe.nextRunAt)}
        </span>
      )}

      {lastRun && status && (
        <button
          type="button"
          disabled={!lastRun.threadId}
          onClick={() => lastRun.threadId && openThread(lastRun.threadId)}
          className={cn(
            "nodrag flex min-w-0 items-center gap-1.5 self-start text-xs text-muted-foreground",
            lastRun.threadId && "hover:text-foreground hover:underline",
          )}
          title={lastRun.threadId ? "Open the conversation" : undefined}
        >
          <span
            className={cn("size-2 shrink-0 rounded-full", status.className)}
          />
          <span className="truncate">
            {status.label} · {formatDateTime(lastRun.startedAt)}
          </span>
        </button>
      )}

      <div className="min-h-1 flex-1" />
      {recipe.canLaunch && (
        <Button
          type="button"
          size="sm"
          className="nodrag self-start"
          onClick={handleRun}
          disabled={starting || running}
        >
          <TbPlayerPlay />
          {starting ? "Starting…" : running ? "Running…" : "Run"}
        </Button>
      )}
    </div>
  );
}

/** Les recipes de l'utilisateur qui visent ce canvas. */
function RecipePicker({
  canvasId,
  value,
  onPick,
}: {
  canvasId: Id<"canvases">;
  value?: Id<"recipes">;
  onPick: (id: Id<"recipes">) => void;
}) {
  const recipes = useQuery(api.recipes.listForCanvas, { canvasId });
  if (recipes === undefined) {
    return <span className="text-xs text-muted-foreground">Loading…</span>;
  }
  if (recipes.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">
        None of your recipes runs on this canvas.{" "}
        <Link to="/settings/recipes" className="nodrag underline">
          Create one
        </Link>
      </span>
    );
  }
  return (
    <Select value={value} onValueChange={(id) => onPick(id as Id<"recipes">)}>
      <SelectTrigger className="nodrag w-full">
        <SelectValue placeholder="Your recipes for this canvas" />
      </SelectTrigger>
      <SelectContent>
        {recipes.map((recipe) => (
          <SelectItem key={recipe._id} value={recipe._id}>
            {recipe.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default memo(TaskNode, areNodePropsEqual);
