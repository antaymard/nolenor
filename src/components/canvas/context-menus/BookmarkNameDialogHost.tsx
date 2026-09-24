import { useEffect } from "react";
import type { Id } from "@/../convex/_generated/dataModel";
import type { BookmarkTarget } from "@/../convex/schemas/canvasBookmarksSchema";
import { useCanvasBookmarks } from "@/hooks/useCanvasBookmarks";
import { useBookmarkNameDialogStore } from "@/stores/bookmarkNameDialogStore";
import BookmarkNameDialog from "./BookmarkNameDialog";

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
 * Le flux « poser un repère, puis le nommer » : l'item du menu ne crée rien,
 * il annonce la cible au store (`startBookmark`) et se ferme ; ce composant,
 * monté par `CanvasFlow` HORS du menu contextuel, rend le dialogue et crée le
 * repère au submit. Rendu depuis le menu, il était démonté avec lui dès le
 * clic (cf. `useBookmarkNameDialogStore`).
 */
export default function BookmarkNameDialogHost({
  canvasId,
}: {
  canvasId: Id<"canvases">;
}) {
  // Écriture seule : la liste des repères n'a rien à faire ici.
  const { create } = useCanvasBookmarks({ canvasId, enabled: false });
  const pendingTarget = useBookmarkNameDialogStore(
    (state) => state.pendingTarget,
  );
  const open = useBookmarkNameDialogStore((state) => state.open);
  const close = useBookmarkNameDialogStore((state) => state.close);

  // Le canvas change sous un dialogue ouvert : la cible (des llmid, un point du
  // monde) ne vaut que pour le canvas qui l'a vue naître. On referme plutôt
  // que de la poser ailleurs.
  useEffect(() => close, [canvasId, close]);

  const copy = pendingTarget !== null ? dialogCopy(pendingTarget) : null;

  return (
    <BookmarkNameDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) close();
      }}
      title={copy?.title ?? ""}
      description={copy?.description ?? ""}
      placeholder={copy?.placeholder ?? ""}
      onSubmit={(label) => {
        close();
        if (pendingTarget !== null) void create(pendingTarget, label);
      }}
    />
  );
}
