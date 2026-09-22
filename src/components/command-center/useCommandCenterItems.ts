import { useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { TbBookmark, TbLayoutBoard, TbUsers } from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { useCanvasBookmarks } from "@/hooks/useCanvasBookmarks";
import { useUserCanvases } from "@/hooks/useUserCanvases";
import { useCommandCenterStore } from "@/stores/commandCenterStore";
import type { CommandItem } from "./commandCenterTypes";

// L'ordre des clés fixe l'ordre des sections. Les repères passent devant les
// canvases : sur un canvas ouvert, aller quelque part *dedans* est le geste le
// plus fréquent, et en changer l'exception.
export const COMMAND_GROUPS = {
  bookmarks: "Bookmarks",
  canvases: "Canvases",
  sharedCanvases: "Shared with me",
} as const;

/**
 * Construit la liste des commandes disponibles.
 *
 * Point d'extension unique du command center : ajouter une fonctionnalité, ce
 * n'est qu'ajouter des `CommandItem` ici (et un groupe dans `COMMAND_GROUPS`
 * pour fixer l'ordre des sections).
 *
 * `enabled` évite de faire tourner les requêtes tant que la modale est fermée.
 */
export function useCommandCenterItems({ enabled }: { enabled: boolean }): {
  items: CommandItem[];
  isLoading: boolean;
} {
  const navigate = useNavigate();
  const { isAuthenticated } = useConvexAuth();
  // Le command center est monté à la racine : selon la route courante il n'y a
  // pas de `canvasId`, d'où le `strict: false`.
  const { canvasId } = useParams({ strict: false }) as {
    canvasId?: Id<"canvases">;
  };

  const { ownCanvases, sharedCanvases, isLoading } = useUserCanvases({
    enabled: enabled && isAuthenticated,
  });

  // Le pont posé par `CanvasFlow`. `null` = aucun canvas ouvert, donc aucun
  // repère à proposer — et rien pour y aller, ce composant vivant hors du
  // `ReactFlowProvider` (cf. `useRegisterCanvasNavigator`).
  const canvasNavigator = useCommandCenterStore(
    (state) => state.canvasNavigator,
  );
  const { bookmarks } = useCanvasBookmarks({
    canvasId,
    enabled: enabled && isAuthenticated && canvasNavigator !== null,
  });

  const items = useMemo<CommandItem[]>(() => {
    const toCommand = (
      canvas: { _id: Id<"canvases">; name: string; description?: string },
      group: string,
      icon: typeof TbLayoutBoard,
    ): CommandItem => ({
      id: `canvas:${canvas._id}`,
      label: canvas.name,
      group,
      icon,
      hint: canvas._id === canvasId ? "Current" : undefined,
      keywords: canvas.description ? [canvas.description] : undefined,
      run: () => {
        void navigate({
          to: "/canvas/$canvasId",
          params: { canvasId: canvas._id },
        });
      },
    });

    // Un repère mort (node supprimé) n'est pas proposé : le palette exécute,
    // il ne montre pas d'état. Le panneau de la toolbar, lui, les garde
    // visibles pour qu'on puisse les nettoyer.
    const bookmarkCommands: CommandItem[] =
      canvasNavigator === null
        ? []
        : (bookmarks ?? [])
            .filter((bookmark) => !bookmark.isDangling)
            .map((bookmark) => ({
              id: `bookmark:${bookmark._id}`,
              label: bookmark.displayLabel,
              group: COMMAND_GROUPS.bookmarks,
              icon: TbBookmark,
              run: () => {
                canvasNavigator(bookmark.target);
              },
            }));

    return [
      ...bookmarkCommands,
      ...ownCanvases.map((canvas) =>
        toCommand(canvas, COMMAND_GROUPS.canvases, TbLayoutBoard),
      ),
      ...sharedCanvases.map((canvas) =>
        toCommand(canvas, COMMAND_GROUPS.sharedCanvases, TbUsers),
      ),
    ];
  }, [
    bookmarks,
    canvasNavigator,
    ownCanvases,
    sharedCanvases,
    canvasId,
    navigate,
  ]);

  return { items, isLoading };
}
