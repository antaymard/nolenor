import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api } from "../../convex/_generated/api";
import { VscGithubProject } from "react-icons/vsc";
import { useState, useEffect, useRef } from "react";
import CanvasFormModal from "../components/canvas/CanvasFormModal";
import { Dialog } from "@/components/shadcn/dialog";
import { useConvexAuth, useConvex } from "convex/react";
import { toastError } from "@/components/utils/errorUtils";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

function RouteComponent() {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isGettingLastCanvas, setIsGettingLastCanvas] = useState<boolean>(true);
  const { isAuthenticated, isLoading } = useConvexAuth();
  const convex = useConvex();
  const navigate = useNavigate();
  // Le provisioning est un one-shot. Le modèle serveur est déjà idempotent
  // (il rend le canvas existant s'il y en a un), mais un re-run de l'effet
  // relancerait un aller-retour inutile pendant que le premier est en vol.
  const hasProvisionedRef = useRef(false);

  useEffect(() => {
    // Si pas authentifié, rediriger vers signin
    if (!isLoading && !isAuthenticated) {
      navigate({ to: "/signin" });
      return;
    }

    // Si authentifié, vérifier s'il existe un canvas
    if (!isLoading && isAuthenticated) {
      convex
        .query(api.canvases.getLastModified, {})
        .then((result) => {
          if (result?.success && result.canvas) {
            navigate({
              to: "/canvas/$canvasId",
              params: { canvasId: result.canvas._id },
            });
            return;
          }

          // Aucun canvas : le compte n'a jamais eu d'espace de travail. On
          // provisionne ici plutôt que dans le flux d'inscription parce que
          // TOUS les chemins d'authentification convergent sur cette route —
          // /signin ne peut pas servir de point d'accroche : l'inscription par
          // mot de passe s'y termine sur l'étape de vérification d'email (le
          // `step` n'y vaut plus "signUp" quand la session s'ouvre), et le
          // retour de redirection Google n'y repasse jamais.
          if (hasProvisionedRef.current) {
            setIsGettingLastCanvas(false);
            return;
          }
          hasProvisionedRef.current = true;

          return convex
            .mutation(api.onboarding.provisionFirstCanvas, {})
            .then((canvasId) => {
              navigate({ to: "/canvas/$canvasId", params: { canvasId } });
            });
        })
        .catch((error: unknown) => {
          // Sans ce catch, un échec de la query laissait `isGettingLastCanvas`
          // à true : « Loading... » indéfiniment, et une unhandled rejection
          // que personne n'observait. Couvre aussi l'échec du provisioning :
          // le repli est l'état vide ci-dessous, qui laisse créer un espace de
          // travail à la main.
          setIsGettingLastCanvas(false);
          toastError(error, "Could not load your workspaces");
        });
    }
  }, [isLoading, isAuthenticated, convex, navigate]);

  // Afficher un loader pendant le chargement ou si une redirection est en cours
  if (isLoading || !isAuthenticated || isGettingLastCanvas) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-100">
        <div className="animate-appear">Loading...</div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-gray-100">
      <div className="flex flex-col items-center justify-center h-full gap-5 animate-appear-up">
        <p className="text-gray-500">
          No workspace found. Create a new one!
        </p>
        <button
          type="button"
          className="flex items-center gap-2 bg-violet-500 px-3 py-2 rounded-md text-white hover:bg-violet-600"
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
