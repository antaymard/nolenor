import { createFileRoute } from "@tanstack/react-router";
import HomePage from "@/components/home/HomePage";

/**
 * La page d'accueil.
 *
 * `/` était un aiguillage : il lisait le dernier canvas modifié et y
 * redirigeait aussitôt. On ne voyait donc jamais ses canvas, et tout ce qui
 * renvoie ici — suppression du canvas courant, « Back to my canvases » d'un
 * écran d'erreur, sortie des settings, retour de Google — atterrissait sur un
 * autre canvas plutôt que sur une page.
 *
 * Le garde d'auth et la sidebar vivent dans le layout `_app`.
 */
export const Route = createFileRoute("/_app/")({
  component: HomePage,
});
