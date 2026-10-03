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
import { useDeleteConfirmStore } from "@/stores/deleteConfirmStore";

/**
 * Supprimer une frame compacte supprime son contenu, que la carte masque : on
 * le dit avant, avec le nombre de nodes concernés. La suppression reste
 * annulable (Ctrl+Z) et passe par la corbeille, frame et contenu ensemble.
 */
export default function CompactFrameDeleteDialog() {
  const pending = useDeleteConfirmStore((state) => state.pending);
  const answer = useDeleteConfirmStore((state) => state.answer);
  const count = pending?.hiddenNodeCount ?? 0;

  return (
    <AlertDialog
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) answer(false);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete compact frame?</AlertDialogTitle>
          <AlertDialogDescription>
            {`${count} hidden ${count === 1 ? "node" : "nodes"} inside will be deleted too. You can undo this, or restore them from the trash.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => answer(true)}
            className={buttonVariants({ variant: "destructive" })}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
