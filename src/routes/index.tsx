import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useConvexAuth } from "convex/react";
import HomePage from "@/components/home/HomePage";
import { Spinner } from "@/components/shadcn/spinner";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

/**
 * La page d'accueil.
 *
 * `/` était un aiguillage : il lisait le dernier canvas modifié et y
 * redirigeait aussitôt. On ne voyait donc jamais ses workspaces, et tout ce qui
 * renvoie ici — suppression du canvas courant, « Back to my canvases » d'un
 * écran d'erreur, sortie des settings, retour de Google — atterrissait sur un
 * autre canvas plutôt que sur une page. Le dernier canvas reste à un clic, via
 * la carte « Pick up where you left off ».
 */
function RouteComponent() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void navigate({ to: "/signin" });
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Le temps de savoir, et pendant la redirection : ni la home ni un écran
  // vide, qui clignoteraient l'un comme l'autre.
  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-[#f7f7f8]">
        <Spinner className="animate-appear size-6 text-muted-foreground" />
      </div>
    );
  }

  return <HomePage />;
}
