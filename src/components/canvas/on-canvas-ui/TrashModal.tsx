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
import { ScrollArea } from "@/components/shadcn/scroll-area";
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

  if (trashed.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        Nothing in the trash.
      </p>
    );
  }

  async function restore(nodeId: string) {
    setRestoringId(nodeId);
    try {
      await untrash({ nodeIds: [nodeId], restoreIncidentEdges: true });
    } catch (error) {
      toastError(error, "Could not restore this block");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <ScrollArea className="max-h-[50vh]">
      <ul className="flex flex-col gap-1">
        {trashed.map(({ node, title, hasContent }) => {
          const Icon = NODE_TYPE_ICON_MAP[node.type] ?? NODE_TYPE_ICON_MAP.title;
          return (
            <li
              key={node._id}
              className="hover:bg-accent flex items-center gap-3 rounded-md px-2 py-2"
            >
              <Icon className="text-muted-foreground shrink-0" size={18} />
              <div className="min-w-0 flex-1">
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
                disabled={restoringId === node.id}
                onClick={() => void restore(node.id)}
              >
                Restore
              </Button>
            </li>
          );
        })}
      </ul>
    </ScrollArea>
  );
}
