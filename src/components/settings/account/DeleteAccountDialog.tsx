import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation } from "convex/react";
import toast from "react-hot-toast";
import { TbAlertTriangle, TbTrash } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { toastError } from "@/components/utils/errorUtils";

// Ce que la suppression emporte, dit à l'utilisateur avant qu'il tape son
// adresse. La liste suit ce que fait réellement la cascade côté serveur
// (cf. convex/models/accountDeletionModels.ts) : si l'une bouge, l'autre aussi.
const DELETED_ITEMS = [
  "your canvases, with every node, file and connection they hold",
  "your conversations with Nolë, and everything she remembers about you",
  "your skills, recipes, custom nodes and API tokens",
  "your access to the canvases others have shared with you",
];

export default function DeleteAccountDialog({ email }: { email: string }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);

  const deleteMyAccount = useMutation(api.accountDeletion.deleteMyAccount);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  // Même tolérance que le serveur (casse et espaces) : ce qu'on demande, c'est
  // que l'utilisateur sache quel compte il détruit, pas qu'il tape juste.
  const matches =
    confirmation.trim().toLowerCase() === email.trim().toLowerCase();

  const handleOpenChange = (nextOpen: boolean) => {
    // Rien ne se ferme pendant la suppression : le compte est peut-être déjà
    // détruit côté serveur, et il reste la déconnexion à faire.
    if (isDeleting) return;
    setConfirmation("");
    setOpen(nextOpen);
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await deleteMyAccount({ email: confirmation.trim() });

      // La session est déjà détruite en base : cet appel ne sert qu'à vider
      // les tokens que le navigateur garde en localStorage. Sans lui, le JWT
      // en cours resterait valide jusqu'à son expiration et l'app continuerait
      // de se croire connectée — à un compte qui n'existe plus.
      //
      // Côté serveur il ne reste rien à faire (la session a déjà disparu, la
      // mutation ne trouve rien et ne jette pas), et `signOut` efface les
      // tokens quoi qu'il arrive ; ce catch ne couvre que le stockage
      // lui-même.
      try {
        await signOut();
      } catch (error) {
        console.error("Sign out after account deletion failed:", error);
      }

      toast.success("Your account has been deleted");
      navigate({ to: "/signin" });
    } catch (error) {
      toastError(error, "Could not delete your account");
      setIsDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="text-red-600 hover:text-red-700"
        >
          <TbTrash />
          Delete my account
        </Button>
      </DialogTrigger>

      <DialogContent showCloseButton={!isDeleting}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TbAlertTriangle className="text-red-600" />
            Delete your account
          </DialogTitle>
          <DialogDescription>
            This cannot be undone. Deleting your account permanently erases:
          </DialogDescription>
        </DialogHeader>

        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {DELETED_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>

        <p className="text-sm text-muted-foreground">
          Want to keep a copy?{" "}
          <Link
            to="/settings/export"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => handleOpenChange(false)}
          >
            Export your data
          </Link>{" "}
          first — afterwards, nothing can be recovered.
        </p>

        <form
          className="flex flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (matches && !isDeleting) void handleDelete();
          }}
        >
          <Label htmlFor="delete-account-confirmation">
            Type <span className="font-mono font-semibold">{email}</span> to
            confirm
          </Label>
          <Input
            id="delete-account-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={email}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            disabled={isDeleting}
            // Le champ est la confirmation : c'est lui qui doit avoir le
            // focus à l'ouverture, pas le bouton qui détruit le compte.
            autoFocus
          />
        </form>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isDeleting}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="destructive"
            disabled={!matches || isDeleting}
            onClick={() => void handleDelete()}
          >
            {isDeleting ? "Deleting…" : "Delete my account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
