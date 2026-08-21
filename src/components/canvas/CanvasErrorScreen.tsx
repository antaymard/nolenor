import { Link } from "@tanstack/react-router";
import { Button } from "@/components/shadcn/button";
import ErrorDisplay from "@/components/ui/ErrorDisplay";

/**
 * Écran d'erreur d'un canvas qu'on n'arrive pas (ou plus) à charger.
 *
 * Le cas qui compte n'est pas la mauvaise URL, c'est le canvas qui devient
 * inaccessible *pendant* qu'on est dessus : suppression, ou droits révoqués par
 * son propriétaire. Les queries repassent alors en erreur et l'utilisateur se
 * retrouve sur cet écran, sur une URL qui ne pointe plus sur rien — sans sortie
 * s'il n'a pas la sidebar (canvas partagé, mobile, session non authentifiée).
 * D'où le retour vers `/`, qui rebascule sur son dernier canvas ouvert.
 *
 * Partagé par la surface desktop et le shell mobile pour que les deux offrent
 * la même sortie.
 */
export default function CanvasErrorScreen({
  error,
  isAuthenticated,
  title = "This canvas is unavailable",
}: {
  error: Error;
  isAuthenticated: boolean;
  title?: string;
}) {
  if (!isAuthenticated) {
    return (
      <ErrorDisplay
        title="This canvas is private or unavailable"
        message="Sign in to check whether you have access, or ask the owner to share it with you."
        cta={
          <Button asChild>
            <Link to="/signin">Sign in / Create account</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ErrorDisplay
      title={title}
      error={error}
      cta={
        <Button asChild>
          <Link to="/">Back to my canvases</Link>
        </Button>
      }
    />
  );
}
