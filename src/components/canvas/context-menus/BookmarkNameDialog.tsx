import { useEffect, useState } from "react";
import { MAX_BOOKMARK_LABEL_LENGTH } from "@/../convex/schemas/canvasBookmarksSchema";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shadcn/dialog";
import { Input } from "@/components/shadcn/input";

/**
 * Demande un nom pour un repère `framing` / `selection`, juste après le
 * clic droit qui le pose.
 *
 * Valider vide n'est pas une erreur : l'appelant reçoit `undefined` et le
 * repère retombe sur son libellé par défaut (« Position », « N nodes »).
 */
export default function BookmarkNameDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  submitLabel = "Create",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  placeholder: string;
  submitLabel?: string;
  onSubmit: (label: string | undefined) => void;
}) {
  const [draft, setDraft] = useState("");

  // Un brouillon par ouverture : rouvrir le dialogue ne doit jamais
  // resservir le nom tapé pour le repère précédent.
  useEffect(() => {
    if (open) {
      setDraft("");
    }
  }, [open]);

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = draft.trim();
    onSubmit(trimmed.length > 0 ? trimmed : undefined);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl border-white/40 shadow-[0_6px_20px_rgba(15,23,42,0.12)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onFocus={(event) => event.target.select()}
            placeholder={placeholder}
            maxLength={MAX_BOOKMARK_LABEL_LENGTH}
            // Le dialogue naît d'un clic droit : le focus doit tomber dans le
            // champ sans que l'utilisateur ait à cliquer une seconde fois.
            autoFocus
          />

          <DialogFooter className="mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit">{submitLabel}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
