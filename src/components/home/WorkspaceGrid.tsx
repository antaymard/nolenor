import { useState } from "react";
import { TbPlus } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import CanvasFormModal from "@/components/canvas/CanvasFormModal";
import { Dialog, DialogTrigger } from "@/components/shadcn/dialog";
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
import WorkspaceCard, { type WorkspaceCardCanvas } from "./WorkspaceCard";

interface WorkspaceGridProps {
  ownCanvases: WorkspaceCardCanvas[];
  sharedCanvases: WorkspaceCardCanvas[];
  onDelete: (canvasId: Id<"canvases">) => void;
}

/** Décalage d'apparition des cartes, plafonné comme dans la sidebar : au-delà
 *  d'une dizaine, l'escalier devient une attente. */
const appearDelay = (index: number) => ({
  animationDelay: `${Math.min(index, 10) * 30}ms`,
});

export default function WorkspaceGrid({
  ownCanvases,
  sharedCanvases,
  onDelete,
}: WorkspaceGridProps) {
  // Les deux dialogues vivent ici, montés une fois, et non dans chaque carte :
  // le menu déroulant se démonte au clic sur son entrée, et emporterait avec
  // lui un dialogue qu'il contiendrait.
  const [canvasToEdit, setCanvasToEdit] = useState<WorkspaceCardCanvas | null>(
    null,
  );
  const [canvasToDelete, setCanvasToDelete] =
    useState<WorkspaceCardCanvas | null>(null);

  const confirmDelete = () => {
    if (!canvasToDelete) return;
    onDelete(canvasToDelete._id);
    setCanvasToDelete(null);
  };

  return (
    <div className="flex flex-col gap-10">
      {/* Section masquée quand il n'y a aucun canvas perso : le seul cas est
          celui du compte neuf, où `WelcomeBlock` porte déjà l'invitation à en
          créer un. Deux boutons « créer » l'un sous l'autre ne valent pas
          mieux qu'un. */}
      {ownCanvases.length > 0 && (
        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-gray-500 uppercase">
              Your workspaces
            </h2>
            <span className="text-xs text-gray-400">
              {ownCanvases.length}{" "}
              {ownCanvases.length === 1 ? "workspace" : "workspaces"}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ownCanvases.map((canvas, index) => (
              <WorkspaceCard
                key={canvas._id}
                canvas={canvas}
                onEdit={setCanvasToEdit}
                onDelete={setCanvasToDelete}
                className="animate-appear-up"
                style={appearDelay(index)}
              />
            ))}

            <Dialog>
              <DialogTrigger asChild>
                <button
                  type="button"
                  className="animate-appear-up flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 text-gray-500 transition-colors hover:border-(--brand)/50 hover:bg-white hover:text-(--brand)"
                  style={appearDelay(ownCanvases.length)}
                >
                  <TbPlus size={20} />
                  <span className="text-sm font-medium">New workspace</span>
                </button>
              </DialogTrigger>
              <CanvasFormModal mode="create" />
            </Dialog>
          </div>
        </section>
      )}

      {sharedCanvases.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-gray-500 uppercase">
            Shared with you
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sharedCanvases.map((canvas, index) => (
              <WorkspaceCard
                key={canvas._id}
                canvas={canvas}
                className="animate-appear-up"
                style={appearDelay(index)}
              />
            ))}
          </div>
        </section>
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
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
    </div>
  );
}
