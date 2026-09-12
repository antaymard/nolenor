import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useConvexAuth } from "convex/react";
import { Spinner } from "@/components/shadcn/spinner";

export const Route = createFileRoute("/onboarding")({
  component: RouteComponent,
});

/**
 * L'accueil d'un compte qui vient d'être créé.
 *
 * Destination du retour d'inscription : `routes/signin.tsx` y envoie
 * l'utilisateur à la place de `/` quand le flux qui vient d'aboutir était une
 * inscription (mot de passe, vérification d'email, ou Google lancé depuis
 * l'onglet « Sign Up »).
 *
 * Une page comme les autres, volontairement : rien n'est persisté, rien ne
 * verrouille l'utilisateur ici, et personne n'y est renvoyé de force à la
 * connexion suivante. Ses canvases de démarrage l'attendent déjà sur `/`
 * (provisionnés à l'inscription, cf. `convex/models/onboardingModels.ts`) :
 * cet écran ne conditionne donc l'accès à rien.
 *
 * Monopage : pas de sous-routes, tout le parcours tiendra dans ce composant.
 *
 * Le garde d'auth est celui de `routes/index.tsx` — un visiteur non connecté
 * n'a rien à faire ici, et le spinner évite le clignotement pendant que la
 * session se résout.
 */
function RouteComponent() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void navigate({ to: "/signin" });
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-[#f7f7f8]">
        <Spinner className="animate-appear size-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh w-full overflow-y-auto bg-[#f7f7f8]">
      {/* À coder. */}
    </div>
  );
}
