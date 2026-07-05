import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api } from "../../convex/_generated/api";
import { VscGithubProject } from "react-icons/vsc";
import { useState, useEffect } from "react";
import CanvasFormModal from "../components/canvas/CanvasFormModal";
import { Dialog } from "@/components/shadcn/dialog";
import { useConvexAuth, useConvex } from "convex/react";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isGettingLastCanvas, setIsGettingLastCanvas] = useState<boolean>(true);
  const { isAuthenticated, isLoading } = useConvexAuth();
  const convex = useConvex();
  const navigate = useNavigate();

  useEffect(() => {
    // Si pas authentifié, rediriger vers signin
    if (!isLoading && !isAuthenticated) {
      navigate({ to: "/signin" });
      return;
    }

    // Si authentifié, vérifier s'il existe un canvas
    if (!isLoading && isAuthenticated) {
      convex.query(api.canvases.getLastModified, {}).then((result) => {
        if (result?.success && result.canvas) {
          navigate({
            to: "/canvas/$canvasId",
            params: { canvasId: result.canvas._id },
          });
        } else {
          setIsGettingLastCanvas(false);
        }
      });
    }
  }, [isLoading, isAuthenticated, convex, navigate]);

  // Afficher un loader pendant le chargement ou si une redirection est en cours
  if (isLoading || !isAuthenticated || isGettingLastCanvas) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background text-muted-foreground">
        <div>Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-background">
      <div className="flex flex-col items-center justify-center h-full gap-5">
        <p className="text-muted-foreground">
          No workspace found. Create a new one!
        </p>
        <button
          type="button"
          className="flex items-center gap-2 bg-primary px-3 py-2 rounded-md text-primary-foreground transition-all active:scale-[0.98] hover:bg-primary/90"
          onClick={() => {
            setIsModalOpen(true);
          }}
        >
          <VscGithubProject />
          Create a workspace
        </button>
      </div>
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <CanvasFormModal mode="create" />
      </Dialog>
    </div>
  );
}
