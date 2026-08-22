import { Link } from "@tanstack/react-router";
import { TbArrowRight } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { formatDistanceToNow } from "@/lib/date-utils";

interface ResumeCardProps {
  canvas: {
    _id: Id<"canvases">;
    name: string;
    description?: string;
    updatedAt: number;
    nodeCount: number;
  };
}

/**
 * Le raccourci vers le dernier canvas touché — ce que `/` faisait
 * automatiquement avant d'être une page. On le propose au lieu de l'imposer.
 */
export default function ResumeCard({ canvas }: ResumeCardProps) {
  return (
    <Link
      to="/canvas/$canvasId"
      params={{ canvasId: canvas._id }}
      className="group flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white p-5 transition-colors hover:border-(--brand)/40 hover:bg-gray-50/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand)"
    >
      <div className="min-w-0">
        <p className="text-xs font-medium tracking-wide text-(--brand) uppercase">
          Pick up where you left off
        </p>
        <h2 className="mt-1 truncate text-lg font-semibold text-gray-900">
          {canvas.name}
        </h2>
        <p className="mt-0.5 truncate text-sm text-gray-500">
          {canvas.nodeCount} {canvas.nodeCount === 1 ? "block" : "blocks"} ·
          edited{" "}
          {formatDistanceToNow(new Date(canvas.updatedAt), { addSuffix: true })}
        </p>
      </div>

      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 transition-colors group-hover:bg-(--brand) group-hover:text-white">
        <TbArrowRight size={18} />
      </span>
    </Link>
  );
}
