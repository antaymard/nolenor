import { useNavigate } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";
import { Button } from "@/components/shadcn/button";
import { Dialog, DialogTrigger } from "@/components/shadcn/dialog";
import CanvasFormModal from "@/components/canvas/CanvasFormModal";
import { TbPlus, TbTrash } from "react-icons/tb";
import { cn } from "@/lib/utils";
import { useMobileNoleChat } from "./mobileNoleContextValue";
import { toastError } from "@/components/utils/errorUtils";

interface MobileLeftSidebarProps {
  canvasId: Id<"canvases">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MobileLeftSidebar({
  canvasId,
  open,
  onOpenChange,
}: MobileLeftSidebarProps) {
  const navigate = useNavigate();
  const userCanvases = useQuery(api.canvases.listUserCanvases);
  const deleteCanvas = useMutation(api.canvases.deleteCanvas);

  const { selectThread, threadId, startNewThread } = useMobileNoleChat();

  const userThreads = useQuery(api.threads.listUserThreads, {
    paginationOpts: { numItems: 30, cursor: null },
  });
  const deleteThread = useAction(api.threads.deleteThread);
  const threadsList =
    userThreads?.success &&
    userThreads.threads &&
    !Array.isArray(userThreads.threads)
      ? userThreads.threads.page
      : [];

  const ownCanvases = (userCanvases ?? []).filter((c) => !("shared" in c));
  const sharedCanvases = (userCanvases ?? []).filter((c) => "shared" in c);

  const handleSelectCanvas = (id: Id<"canvases">) => {
    onOpenChange(false);
    void navigate({
      to: "/canvas/$canvasId",
      params: { canvasId: id },
    });
  };

  const handleDeleteCanvas = async (id: Id<"canvases">) => {
    if (confirm("Delete this workspace?")) {
      try {
        await deleteCanvas({ canvasId: id });
      } catch (error) {
        toastError(error, "Error deleting workspace.");
      }
    }
  };

  const handleSelectThread = (selectedId: string) => {
    selectThread(selectedId);
    onOpenChange(false);
  };

  const handleNewThread = async () => {
    onOpenChange(false);
    await startNewThread();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[85vw] sm:max-w-sm p-0">
        <SheetHeader className="border-b">
          <SheetTitle>Workspaces</SheetTitle>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
              Workspaces
            </h3>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <TbPlus size={14} />
                </Button>
              </DialogTrigger>
              <CanvasFormModal mode="create" />
            </Dialog>
          </div>

          {!userCanvases ? (
            <div className="text-sm text-muted-foreground px-2 py-2">
              Loading...
            </div>
          ) : userCanvases.length === 0 ? (
            <div className="text-sm text-muted-foreground px-2 py-2">
              No workspaces
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {ownCanvases.map((c) => (
                <CanvasRow
                  key={c._id}
                  active={c._id === canvasId}
                  name={c.name}
                  onSelect={() => handleSelectCanvas(c._id)}
                  onDelete={() => void handleDeleteCanvas(c._id)}
                />
              ))}
              {sharedCanvases.length > 0 && (
                <>
                  <h4 className="px-2 pt-3 text-xs text-muted-foreground uppercase tracking-wider">
                    Shared with me
                  </h4>
                  {sharedCanvases.map((c) => (
                    <CanvasRow
                      key={c._id}
                      active={c._id === canvasId}
                      name={c.name}
                      onSelect={() => handleSelectCanvas(c._id)}
                    />
                  ))}
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between mt-5 mb-2">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground">
              Conversations
            </h3>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => void handleNewThread()}
              aria-label="New conversation"
            >
              <TbPlus size={14} />
            </Button>
          </div>

          {threadsList.length === 0 ? (
            <div className="text-sm text-muted-foreground px-2 py-2">
              No previous sessions
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {threadsList.map((thread) => (
                <ThreadRow
                  key={thread._id}
                  active={thread._id === threadId}
                  title={thread.title ?? null}
                  onSelect={() => handleSelectThread(thread._id)}
                  onDelete={async () => {
                    try {
                      await deleteThread({ threadId: thread._id });
                    } catch (error) {
                      toastError(error, "Error deleting thread.");
                    }
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CanvasRow({
  name,
  active,
  onSelect,
  onDelete,
}: {
  name: string;
  active: boolean;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-1 group">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex-1 min-w-0 text-left text-sm font-medium px-2 py-2 rounded-md truncate",
          active ? "bg-accent" : "hover:bg-accent/60",
        )}
      >
        {name}
      </button>
      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 opacity-50 hover:opacity-100 hover:text-destructive"
          onClick={onDelete}
          aria-label="Delete workspace"
        >
          <TbTrash size={13} />
        </Button>
      )}
    </div>
  );
}

function ThreadRow({
  title,
  active,
  onSelect,
  onDelete,
}: {
  title: string | null;
  active: boolean;
  onSelect: () => void;
  onDelete: () => Promise<void> | void;
}) {
  return (
    <div className="flex items-center gap-1 group">
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex-1 min-w-0 text-left text-sm px-2 py-2 rounded-md truncate",
          active ? "bg-accent font-medium" : "hover:bg-accent/60",
        )}
      >
        {title || "Untitled"}
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 opacity-50 hover:opacity-100 hover:text-destructive"
        onClick={() => void onDelete()}
        aria-label="Delete thread"
      >
        <TbTrash size={13} />
      </Button>
    </div>
  );
}
