import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { TbTrash } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcn/dialog";
import { NODE_TYPE_ICON_MAP } from "@/components/nodes/prebuilt-nodes/nodeIconMap";
import { toastError } from "@/components/utils/errorUtils";
import { formatDistanceToNowStrict } from "@/lib/date-utils";
import { rememberNodeDocs } from "@/lib/canvasDocCache";
import { useCanvasStore } from "@/stores/canvasStore";
import { TRASH_RETENTION_MS } from "@/../convex/config/trashConfig";

const RETENTION_DAYS = Math.round(TRASH_RETENTION_MS / (24 * 60 * 60 * 1000));

/**
 * La corbeille d'un canvas : ce qui en a été supprimé et qu'on peut encore
 * remettre.
 *
 * Même mutation que l'annulation au clavier (`nodes.untrash`), donc un seul
 * comportement à garantir. La différence est ce qu'on sait des connexions :
 * l'undo nomme celles qu'il a vues disparaître, la modale ne connaît que des
 * nodes et demande donc au serveur de rendre celles parties avec eux.
 */
export default function TrashModal() {
  const canvas = useCanvasStore((state) => state.canvas);
  const [open, setOpen] = useState(false);

  // Réservée à qui peut remettre : la corbeille liste des éléments retirés du
  // canvas, un viewer n'a rien à en faire.
  if (!canvas || canvas._permission === "viewer") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" title="Trash">
          <TbTrash size={18} />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription>
            Deleted blocks are kept for {RETENTION_DAYS} days. Restoring one
            brings back its content and the connections that went with it.
          </DialogDescription>
        </DialogHeader>
        {open && <CanvasFocusGuard />}
        <TrashList canvasId={canvas._id} />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Le clavier appartient à la modale tant qu'elle est ouverte — sans ça, Ctrl+Z
 * annulerait un geste du canvas derrière elle. Copié de `TemplateEditorModal`,
 * même raison. Restaure la valeur PRÉCÉDENTE : une window d'édition peut très
 * bien être ouverte derrière.
 */
function CanvasFocusGuard() {
  useEffect(() => {
    const previous = useCanvasStore.getState().focus;
    useCanvasStore.getState().setFocus("modal");
    return () => useCanvasStore.getState().setFocus(previous);
  }, []);
  return null;
}

function TrashList({ canvasId }: { canvasId: Id<"canvases"> }) {
  const trashed = useQuery(api.nodes.listTrashedFromCanvas, { canvasId });
  const untrash = useMutation(api.nodes.untrash);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // Les docs passent par le registre : c'est lui qui fournit la ligne complète
  // à l'update optimiste d'une restauration, ici comme pour l'undo.
  useEffect(() => {
    if (trashed) rememberNodeDocs(trashed.map((item) => item.node));
  }, [trashed]);

  if (trashed === undefined) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">Loading…</p>
    );
  }

  // Le contenu parti AVEC sa frame ne se liste pas à part : restaurer la
  // frame le ramène, et le voir aligné sous elle donnerait N entrées pour une
  // seule suppression. L'appariement se fait sur l'égalité de `trashedAt`,
  // celle que `trashNodes` pose pour toute sa transaction — un node supprimé
  // dans la frame AVANT qu'elle ne parte a une autre date, et reste listé,
  // parce que lui se restaure bien tout seul.
  const frameTrashedAt = new Map(
    trashed
      .filter(({ node }) => node.type === "frame")
      .map(({ node }) => [node.id, node.trashedAt]),
  );
  const visible = trashed.filter(({ node }) => {
    if (!node.parentId) return true;
    if (!frameTrashedAt.has(node.parentId)) return true;
    return frameTrashedAt.get(node.parentId) !== node.trashedAt;
  });

  if (visible.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Nothing in the trash.
      </p>
    );
  }

  async function restore(nodeId: string) {
    setRestoringId(nodeId);
    try {
      await untrash({
        nodeIds: [nodeId],
        restoreIncidentEdges: true,
        // Restaurer une frame restaure ce qui est parti avec elle : la liste
        // ne montre que la frame (cf. `visible` plus bas), c'est donc à elle
        // de ramener son contenu.
        restoreChildren: true,
      });
    } catch (error) {
      toastError(error, "Could not restore this block");
    } finally {
      setRestoringId(null);
    }
  }

  // `div` natif plutôt que `ScrollArea` : le wrapper interne de Radix
  // (`display: table; min-width: 100%`) mesure la liste en largeur
  // intrinsèque, et un titre long en `truncate` (nowrap, donc insécable)
  // élargit alors toute la ligne au lieu d'être ellipsé — le bouton Restore
  // sort de la modale. Ici la largeur reste définie et le `truncate` fait
  // son travail.
  return (
    <div className="max-h-[50vh] min-w-0 overflow-y-auto">
      <ul className="flex min-w-0 flex-col gap-1">
        {visible.map(({ node, title, hasContent }) => {
          const Icon = NODE_TYPE_ICON_MAP[node.type] ?? NODE_TYPE_ICON_MAP.title;
          return (
            <li
              key={node._id}
              className="hover:bg-accent flex min-w-0 items-center gap-3 rounded-md px-2 py-2"
            >
              <Icon className="text-muted-foreground shrink-0" size={18} />
              <div className="min-w-0 flex-1 overflow-hidden">
                <p className="truncate text-sm">{title}</p>
                <p className="text-muted-foreground text-xs">
                  {node.trashedAt !== undefined
                    ? `Deleted ${formatDistanceToNowStrict(new Date(node.trashedAt), { addSuffix: true })}`
                    : "Deleted"}
                  {!hasContent && " · content already deleted"}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                disabled={restoringId === node.id}
                onClick={() => void restore(node.id)}
              >
                Restore
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
