import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { BookmarkTarget } from "@/../convex/schemas/canvasBookmarksSchema";
import BookmarkNameDialog from "./BookmarkNameDialog";

/** Créer un repère, tel que le rend `useCanvasBookmarks`. */
type CreateBookmark = (target: BookmarkTarget, label?: string) => unknown;

/**
 * La copie du dialogue selon la cible : c'est ici, et pas dans chaque menu,
 * que vivent les libellés du flux de nommage.
 *
 * Totale sur les trois kinds — le cas `node` ne s'atteint pas aujourd'hui (le
 * menu du node crée sans dialogue, son titre vivant sert de nom), mais la
 * fonction n'a pas à mentir sur son domaine pour autant.
 */
function dialogCopy(target: BookmarkTarget): {
  title: string;
  description: string;
  placeholder: string;
} {
  if (target.kind === "framing") {
    return {
      title: "Bookmark this spot",
      description:
        "Give this position a name, or leave it empty to keep the default.",
      placeholder: "Position",
    };
  }
  if (target.kind === "node") {
    return {
      title: "Bookmark this node",
      description:
        "Give this bookmark a name, or leave it empty to keep the node's title.",
      placeholder: "Node",
    };
  }
  return {
    title: "Bookmark this selection",
    description:
      "Give this group a name, or leave it empty to keep the default.",
    placeholder: `${target.nodeIds.length} nodes`,
  };
}

/**
 * Le flux « poser un repère, puis le nommer » : le clic du menu ne crée rien,
 * il fige la cible et ouvre le dialogue — qui survit au menu, fermé dès le
 * clic, d'où le portal.
 *
 * La cible est figée au clic et pas relue au submit : la sélection React Flow
 * peut changer pendant que le dialogue est ouvert, le repère doit viser ce
 * qu'on visait.
 *
 * `startBookmark` se branche sur l'item du menu, `dialog` se rend en fin de
 * menu.
 */
export function useBookmarkNameDialog(create: CreateBookmark): {
  startBookmark: (target: BookmarkTarget) => void;
  dialog: ReactNode;
} {
  const [pendingTarget, setPendingTarget] = useState<BookmarkTarget | null>(
    null,
  );
  // `open` est séparé de `pendingTarget` : la cible survit à la fermeture le
  // temps de l'animation de sortie, sinon le dialogue flasherait sur la copie
  // du repère précédent pendant qu'il se referme.
  const [open, setOpen] = useState(false);

  function startBookmark(target: BookmarkTarget) {
    setPendingTarget(target);
    setOpen(true);
  }

  const copy = pendingTarget !== null ? dialogCopy(pendingTarget) : null;

  const dialog = createPortal(
    <BookmarkNameDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) setOpen(false);
      }}
      title={copy?.title ?? ""}
      description={copy?.description ?? ""}
      placeholder={copy?.placeholder ?? ""}
      onSubmit={(label) => {
        setOpen(false);
        if (pendingTarget !== null) void create(pendingTarget, label);
      }}
    />,
    document.body,
  );

  return { startBookmark, dialog };
}
