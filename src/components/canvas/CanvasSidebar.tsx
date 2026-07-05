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
import CanvasFormModal from "./CanvasFormModal";
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
import { useState } from "react";

export default function CanvasSidebar({
  children,
  canvasId,
}: {
  children: React.ReactNode;
  canvasId: Id<"canvases">;
}) {
  const deleteCanvas = useMutation(api.canvases.deleteCanvas);
  const userCanvases = useQuery(api.canvases.listUserCanvases);

  const currentCanvas = userCanvases?.find((c) => c._id === canvasId);

  const [canvasToDelete, setCanvasToDelete] = useState<{
    id: Id<"canvases">;
    name: string;
  } | null>(null);

  const [canvasToEdit, setCanvasToEdit] = useState<{
    id: Id<"canvases">;
    name: string;
    description: string;
  } | null>(null);

  const confirmDeleteCanvas = async () => {
    if (!canvasToDelete) return;
    await deleteCanvas({ canvasId: canvasToDelete.id });
    setCanvasToDelete(null);
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
                  "text-base! font-medium px-2 py-1 flex-1 min-w-0 truncate rounded-md transition-colors",
                  c._id === canvasId ? "bg-accent" : "hover:bg-accent/60",
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
                      setCanvasToEdit({
                        id: c._id,
                        name: c.name,
                        description: c.description ?? "",
                      })
                    }
                  >
                    Edit
                  </DropdownMenuItem>
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
                      "text-base! font-medium px-2 py-1 flex-1 min-w-0 truncate rounded-md transition-colors",
                      c._id === canvasId
                        ? "bg-accent"
                        : "hover:bg-accent/60",
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
            <span className="font-semibold text-lg truncate">
              {currentCanvas?.name ?? "..."}
            </span>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <TbPlus size={16} />
              </Button>
            </DialogTrigger>
            <CanvasFormModal mode="create" />
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

      <Dialog
        open={canvasToEdit !== null}
        onOpenChange={(open) => {
          if (!open) setCanvasToEdit(null);
        }}
      >
        <CanvasFormModal
          key={canvasToEdit?.id ?? "none"}
          mode="edit"
          canvasId={canvasToEdit?.id}
          initialValues={
            canvasToEdit
              ? {
                  name: canvasToEdit.name,
                  description: canvasToEdit.description,
                }
              : undefined
          }
          onSuccess={() => setCanvasToEdit(null)}
        />
      </Dialog>

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
