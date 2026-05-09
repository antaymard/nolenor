import {
  SidebarProvider,
  SidebarTrigger,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
} from "@/components/shadcn/sidebar";
import { Button } from "@/components/shadcn/button";
import { api } from "@/../convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import type { Id } from "@/../convex/_generated/dataModel";
import { Link } from "@tanstack/react-router";
import { Dialog, DialogTrigger } from "@/components/shadcn/dialog";
import CanvasCreationModal from "./CanvasCreationModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/plate/alert-dialog";
import { buttonVariants } from "@/components/shadcn/button";
import { HiDotsVertical } from "react-icons/hi";
import { TbPlus } from "react-icons/tb";
import { cn } from "@/lib/utils";
import InlineEditableText from "@/components/form-ui/InlineEditableText";
import { useState } from "react";

export default function CanvasSidebar({
  children,
  canvasId,
}: {
  children: React.ReactNode;
  canvasId: Id<"canvases">;
}) {
  const deleteCanvas = useMutation(api.canvases.deleteCanvas);
  const updateCanvasProps = useMutation(api.canvases.updateProps);
  const userCanvases = useQuery(api.canvases.listUserCanvases);

  const currentCanvasName = userCanvases?.find((c) => c._id === canvasId)?.name;

  const [canvasToDelete, setCanvasToDelete] = useState<{
    id: Id<"canvases">;
    name: string;
  } | null>(null);

  const confirmDeleteCanvas = async () => {
    if (!canvasToDelete) return;
    await deleteCanvas({ canvasId: canvasToDelete.id });
    setCanvasToDelete(null);
  };

  const handleUpdateCanvasName = async (newName: string) => {
    if (newName.trim() && newName !== currentCanvasName) {
      await updateCanvasProps({ canvasId, name: newName.trim() });
    }
  };

  function renderUserCanvases() {
    if (!userCanvases) return <div className="p-4">Loading...</div>;
    if (userCanvases.length === 0)
      return (
        <div className="p-4 text-sm text-muted-foreground">No workspaces</div>
      );

    const ownCanvases = userCanvases.filter((c) => !("shared" in c));
    const sharedCanvases = userCanvases.filter((c) => "shared" in c);

    return (
      <SidebarMenu>
        {ownCanvases.map((c) => (
          <div key={c._id}>
            <div className="flex items-center justify-between w-full group px-2">
              <Link
                to="/canvas/$canvasId"
                params={{ canvasId: c._id }}
                className={cn(
                  "text-base! font-medium px-2 py-1 flex-1 min-w-0 truncate  rounded-md",
                  c._id === canvasId ? "bg-slate-200" : "hover:bg-slate-100",
                )}
              >
                {c.name}
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 h-6 w-6"
                  >
                    <HiDotsVertical size={14} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() =>
                      setCanvasToDelete({ id: c._id, name: c.name })
                    }
                    className="text-destructive"
                  >
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}

        {sharedCanvases.length > 0 && (
          <>
            <h4 className="px-4 pt-4 text-xs text-muted-foreground uppercase tracking-wider">
              Shared with me
            </h4>
            {sharedCanvases.map((c) => (
              <div key={c._id}>
                <div className="flex items-center justify-between w-full group px-2">
                  <Link
                    to="/canvas/$canvasId"
                    params={{ canvasId: c._id }}
                    className={cn(
                      "text-base! font-medium px-2 py-1 flex-1 min-w-0 truncate rounded-md",
                      c._id === canvasId
                        ? "bg-slate-200"
                        : "hover:bg-slate-100",
                    )}
                  >
                    {c.name}
                  </Link>
                </div>
              </div>
            ))}
          </>
        )}
      </SidebarMenu>
    );
  }

  return (
    <SidebarProvider defaultOpen={false}>
      <Sidebar variant="sidebar">
        <SidebarHeader className="flex flex-row items-center justify-between p-4">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <InlineEditableText
              value={currentCanvasName ?? "..."}
              onSave={handleUpdateCanvasName}
              className="font-semibold text-lg truncate"
              placeholder="Workspace name"
              as="span"
            />
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <TbPlus size={16} />
              </Button>
            </DialogTrigger>
            <CanvasCreationModal />
          </Dialog>
        </SidebarHeader>
        <SidebarContent className="py-4">
          <h3 className="px-4">Workspaces</h3>
          {renderUserCanvases()}
        </SidebarContent>
        <SidebarFooter></SidebarFooter>
      </Sidebar>

      <SidebarInset className="flex-1">
        <span className="absolute top-2 left-2 z-10">
          <SidebarTrigger />
        </span>
        {children}
      </SidebarInset>

      <AlertDialog
        open={canvasToDelete !== null}
        onOpenChange={(open) => {
          if (!open) setCanvasToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete workspace?</AlertDialogTitle>
            <AlertDialogDescription>
              {canvasToDelete
                ? `“${canvasToDelete.name}” will be permanently deleted. This action cannot be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDeleteCanvas}
              className={buttonVariants({ variant: "destructive" })}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
}
