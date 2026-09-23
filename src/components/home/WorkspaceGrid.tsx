import { useState } from "react";
import { TbLayoutGrid, TbList } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import CanvasFormModal from "@/components/canvas/CanvasFormModal";
import {
  pendingTasksOf,
  type PendingTasksByCanvas,
} from "@/hooks/useHomePendingTasks";
import { Dialog } from "@/components/shadcn/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/shadcn/alert-dialog";
import { buttonVariants } from "@/components/shadcn/button";
import {
  readHomeCanvasLayout,
  writeHomeCanvasLayout,
  type HomeCanvasLayout,
} from "@/lib/homeLayoutStorage";
import { cn } from "@/lib/utils";
import WorkspaceCard, { type WorkspaceCardCanvas } from "./WorkspaceCard";
import WorkspaceRow from "./WorkspaceRow";

type CanvasFilter = "all" | "mine" | "shared";

const FILTERS: { value: CanvasFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mine", label: "Mine" },
  { value: "shared", label: "Shared with me" },
];

interface WorkspaceGridProps {
  ownCanvases: WorkspaceCardCanvas[];
  sharedCanvases: WorkspaceCardCanvas[];
  /** Les tâches en attente de Nolë, par canvas : chaque carte y pioche les
   *  siennes. Une carte sans entrée n'affiche rien. */
  pendingTasks: PendingTasksByCanvas;
  onDelete: (canvasId: Id<"canvases">) => void;
}

/** Décalage d'apparition des cartes, plafonné comme dans la sidebar : au-delà
 *  d'une dizaine, l'escalier devient une attente. */
const appearDelay = (index: number) => ({
  animationDelay: `${Math.min(index, 10) * 30}ms`,
});

/**
 * « Recent canvases » : tous les canvas, les siens et ceux reçus en partage,
 * du plus récemment modifié au plus ancien.
 *
 * Un canvas qui a des tâches en attente reste ici, avec sa pastille : le
 * retirer le ferait sauter d'une section à l'autre à chaque clear, et on ne le
 * retrouverait plus là où on l'attend.
 */
export default function WorkspaceGrid({
  ownCanvases,
  sharedCanvases,
  pendingTasks,
  onDelete,
}: WorkspaceGridProps) {
  const [filter, setFilter] = useState<CanvasFilter>("all");
  const [layout, setLayoutState] =
    useState<HomeCanvasLayout>(readHomeCanvasLayout);
  // Les deux dialogues vivent ici, montés une fois, et non dans chaque carte :
  // le menu déroulant se démonte au clic sur son entrée, et emporterait avec
  // lui un dialogue qu'il contiendrait.
  const [canvasToEdit, setCanvasToEdit] = useState<WorkspaceCardCanvas | null>(
    null,
  );
  const [canvasToDelete, setCanvasToDelete] =
    useState<WorkspaceCardCanvas | null>(null);

  const setLayout = (next: HomeCanvasLayout) => {
    setLayoutState(next);
    writeHomeCanvasLayout(next);
  };

  const confirmDelete = () => {
    if (!canvasToDelete) return;
    onDelete(canvasToDelete._id);
    setCanvasToDelete(null);
  };

  // Le filtre n'a de sens que s'il y a des deux : sans canvas partagé, « All »
  // et « Mine » sont la même liste.
  const hasBothKinds = ownCanvases.length > 0 && sharedCanvases.length > 0;
  const activeFilter = hasBothKinds ? filter : "all";
  const canvases = (
    activeFilter === "mine"
      ? ownCanvases
      : activeFilter === "shared"
        ? sharedCanvases
        : [...ownCanvases, ...sharedCanvases]
  )
    .slice()
    .sort((a, b) => b.updatedAt - a.updatedAt);

  if (ownCanvases.length === 0 && sharedCanvases.length === 0) return null;

  const itemProps = (canvas: WorkspaceCardCanvas, index: number) => ({
    canvas,
    // Les partagés n'ont ni édition ni suppression : on n'y a pas ces droits.
    onEdit: canvas.shared ? undefined : setCanvasToEdit,
    onDelete: canvas.shared ? undefined : setCanvasToDelete,
    pendingTasks: pendingTasksOf(pendingTasks, canvas._id),
    className: "animate-appear-up",
    style: appearDelay(index),
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-bold text-slate-900">Recent canvases</h2>
        <span className="text-sm text-slate-500">{canvases.length}</span>
        <span className="flex-1" />

        {hasBothKinds && (
          <SegmentedControl label="Filter canvases">
            {FILTERS.map((option) => (
              <SegmentButton
                key={option.value}
                active={activeFilter === option.value}
                onClick={() => setFilter(option.value)}
              >
                {option.label}
              </SegmentButton>
            ))}
          </SegmentedControl>
        )}

        <SegmentedControl label="Layout">
          <SegmentButton
            active={layout === "grid"}
            onClick={() => setLayout("grid")}
            aria-label="Grid view"
          >
            <TbLayoutGrid className="size-4" />
          </SegmentButton>
          <SegmentButton
            active={layout === "list"}
            onClick={() => setLayout("list")}
            aria-label="List view"
          >
            <TbList className="size-4" />
          </SegmentButton>
        </SegmentedControl>
      </div>

      {layout === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {canvases.map((canvas, index) => (
            <WorkspaceCard key={canvas._id} {...itemProps(canvas, index)} />
          ))}
        </div>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-slate-200">
          {canvases.map((canvas, index) => (
            <WorkspaceRow key={canvas._id} {...itemProps(canvas, index)} />
          ))}
        </ul>
      )}

      <Dialog
        open={canvasToEdit !== null}
        onOpenChange={(open) => {
          if (!open) setCanvasToEdit(null);
        }}
      >
        <CanvasFormModal
          key={canvasToEdit?._id ?? "none"}
          mode="edit"
          canvasId={canvasToEdit?._id}
          initialValues={
            canvasToEdit
              ? {
                  name: canvasToEdit.name,
                  description: canvasToEdit.description ?? "",
                }
              : undefined
          }
          onSuccess={() => setCanvasToEdit(null)}
        />
      </Dialog>

      <AlertDialog
        open={canvasToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setCanvasToDelete(null);
        }}
      >
        <AlertDialogContent className="rounded-2xl border-white/40 shadow-[0_6px_20px_rgba(15,23,42,0.12)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete canvas?</AlertDialogTitle>
            <AlertDialogDescription>
              {canvasToDelete
                ? `“${canvasToDelete.name}” will be permanently deleted. Its blocks and conversations go with it. This action cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className={buttonVariants({ variant: "destructive" })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function SegmentedControl({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5"
    >
      {children}
    </div>
  );
}

function SegmentButton({
  active,
  className,
  ...props
}: React.ComponentProps<"button"> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "flex h-7 items-center justify-center rounded-md px-2.5 text-xs font-semibold transition-colors",
        active
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-500 hover:text-slate-700",
        className,
      )}
      {...props}
    />
  );
}
