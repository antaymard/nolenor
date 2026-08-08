import type { Id } from "@/../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/shadcn/dialog";
import { cn } from "@/lib/utils";
import VersionHistoryViewer from "./VersionHistoryViewer";
import AssociatedThreadsViewer from "./AssociatedThreadsViewer";

interface NodeWindowDialogsProps {
  nodeDataId: Id<"nodeDatas">;
  title: string | undefined;
  historyOpen: boolean;
  onHistoryOpenChange: (open: boolean) => void;
  threadsOpen: boolean;
  onThreadsOpenChange: (open: boolean) => void;
  /** Mobile : ouvrir le thread dans le chat plutôt que de rester sur place. */
  onOpenThread?: (threadId: string) => void;
  contentClassName?: string;
}

/**
 * Les deux modales secondaires d'une fenêtre de node (historique de versions,
 * conversations associées), identiques sur desktop et mobile à la taille près.
 */
export default function NodeWindowDialogs({
  nodeDataId,
  title,
  historyOpen,
  onHistoryOpenChange,
  threadsOpen,
  onThreadsOpenChange,
  onOpenThread,
  contentClassName,
}: NodeWindowDialogsProps) {
  return (
    <>
      <Dialog open={historyOpen} onOpenChange={onHistoryOpenChange}>
        <DialogContent
          className={cn("flex h-[70vh] max-h-175 flex-col", contentClassName)}
        >
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>{title ?? "—"}</DialogDescription>
          </DialogHeader>
          <VersionHistoryViewer
            nodeDataId={nodeDataId}
            closeModale={() => onHistoryOpenChange(false)}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={threadsOpen} onOpenChange={onThreadsOpenChange}>
        <DialogContent
          className={cn("flex h-[70vh] max-h-175 flex-col", contentClassName)}
        >
          <DialogHeader>
            <DialogTitle>Associated threads</DialogTitle>
            <DialogDescription>{title ?? "—"}</DialogDescription>
          </DialogHeader>
          <AssociatedThreadsViewer
            nodeDataId={nodeDataId}
            closeModale={() => onThreadsOpenChange(false)}
            onOpenThread={onOpenThread}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
