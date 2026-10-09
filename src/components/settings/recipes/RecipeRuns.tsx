import { Link } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Doc, Id } from "@/../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { formatDateTime } from "./recipeTriggers";

type RunStatus = Doc<"runs">["status"];

const STATUS: Record<RunStatus, { label: string; className: string }> = {
  running: { label: "Running", className: "bg-blue-50 text-blue-700" },
  waiting: {
    label: "Needs an answer",
    className: "bg-amber-50 text-amber-700",
  },
  idle: { label: "Done", className: "bg-emerald-50 text-emerald-700" },
  error: { label: "Failed", className: "bg-red-50 text-red-700" },
  aborted: { label: "Stopped", className: "bg-slate-100 text-slate-600" },
};

/** Les derniers runs d'une recipe ; chacun ouvre sa conversation. */
export default function RecipeRuns({ recipeId }: { recipeId: Id<"recipes"> }) {
  const runs = useQuery(api.recipes.listRuns, { recipeId });

  if (runs === undefined) {
    return <p className="text-sm text-slate-500 italic">Loading…</p>;
  }
  if (runs.length === 0) {
    return (
      <p className="text-sm text-slate-500 italic">
        No runs yet. Run it now, or wait for its next trigger.
      </p>
    );
  }

  return (
    <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-surface">
      {runs.map((run) => {
        const status = STATUS[run.status];
        return (
          <Link
            key={run._id}
            to="/canvas/$canvasId"
            params={{ canvasId: run.canvasId }}
            search={{ thread: run.threadId }}
            className="flex items-center gap-3 p-3 text-sm transition-colors hover:bg-slate-100"
          >
            <span
              className={cn(
                "shrink-0 rounded px-2 py-0.5 text-xs font-medium",
                status.className,
              )}
            >
              {status.label}
            </span>
            <span className="min-w-0 flex-1 truncate text-slate-600">
              {run.error ?? run.answerText ?? run.request}
            </span>
            <span className="shrink-0 text-slate-500">
              {formatDateTime(run.startedAt)}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
