import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState, useEffect } from "react";
import { FcGoogle } from "react-icons/fc";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import toast from "react-hot-toast";
import { useConvexAuth } from "convex/react";
import { ConvexError } from "convex/values";

export const Route = createFileRoute("/signin")({
  component: RouteComponent,
});

const INPUT_CLASSNAME =
  "bg-white border-gray-200 text-gray-900 placeholder:text-gray-300 h-11 focus-visible:ring-0 focus-visible:border-gray-300";

const SPINNER_CLASSNAME =
  "h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin";

/**
 * Les deux étapes de code portent l'adresse parce qu'elles doivent la reposter :
 * le code est court, le serveur a besoin de savoir à quel compte le confronter.
 * On ne va pas la redemander à l'utilisateur.
 *
 * `kind` les distingue : elles postent des `flow` différents et n'affichent pas
 * les mêmes champs. Les confondre reviendrait à envoyer un code de
 * réinitialisation sur le flux de vérification, que le backend refuserait —
 * les deux providers OTP ont volontairement des `id` distincts (cf.
 * `convex/ResendOTPPasswordReset.ts`).
 */
type Step =
  | "signIn"
  | "signUp"
  | "forgot"
  | { email: string; kind: "verify" }
  | { email: string; kind: "reset" };

function RouteComponent() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [step, setStep] = useState<Step>("signIn");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleRedirecting, setIsGoogleRedirecting] = useState(false);
  const navigate = useNavigate();

  // Le formulaire entier est gelé pendant qu'une des deux méthodes travaille :
  // lancer un mot de passe pendant que Google redirige laisserait deux flux
  // d'authentification concurrents sur la même page.
  const isBusy = isSubmitting || isGoogleRedirecting;
  const codeStep = typeof step === "object" ? step : null;
  // TypeScript ne déduit pas que `step` est une chaîne dans les branches de
  // rendu : on nomme la valeur étroite plutôt que de caster là où elle sert.
  const credentialsFlow: "signIn" | "signUp" =
    step === "signUp" ? "signUp" : "signIn";

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate({ to: "/" });
    }
  }, [isAuthenticated, isLoading, navigate]);

  const handleGoogle = () => {
    setIsGoogleRedirecting(true);
    // `redirectTo` explicite : `SITE_URL` n'a qu'une valeur par déploiement
    // alors que .com et .fr servent la même app, et le verifier PKCE est rangé
    // dans le `localStorage` de CETTE origine. Revenir ailleurs, c'est revenir
    // sans verifier. L'allowlist de `convex/auth.ts` décide si l'origine est
    // suivie.
    //
    // Retour sur "/" : c'est le dispatcher (dernier canvas, sinon création
    // d'espace de travail).
    signIn("google", { redirectTo: `${window.location.origin}/` }).catch((e) => {
      console.error(e);
      // Pas de `finally` : quand ça marche, le navigateur part sur Google et
      // remettre le bouton à l'état normal ne ferait que le faire clignoter.
      setIsGoogleRedirecting(false);
      toast.error("Could not start Google sign-in. Please try again.");
    });
  };

  const handleCredentials = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");

    signIn("password", formData)
      .then((result) => {
        // `signingIn: false` ne veut pas dire échec — un échec lève. Ça veut
        // dire que la lib a dérouté vers la vérification d'email, soit à
        // l'inscription, soit à la première connexion d'un compte créé avant
        // que la vérification n'existe.
        if (!result.signingIn) {
          setStep({ email, kind: "verify" });
          toast.success("We sent a verification code to your email.");
          return;
        }
        toast.success(
          credentialsFlow === "signIn"
            ? "Successfully signed in!"
            : "Account created successfully!",
        );
      })
      .catch((e) => {
        console.error(e);
        // Une `ConvexError` porte un message écrit pour l'utilisateur (quota
        // d'envoi dépassé, avec le délai d'attente). Le laisser filer jusqu'aux
        // branches génériques ci-dessous l'écraserait par un texte plus vague.
        if (e instanceof ConvexError && typeof e.data === "string") {
          toast.error(e.data);
          return;
        }
        const errorMessage = e?.message || String(e);
        if (errorMessage.includes("already exists")) {
          toast.error(
            "This account already exists. Sign in or use a different email.",
          );
        } else if (
          errorMessage.includes("Invalid password") ||
          errorMessage.includes("invalid password") ||
          errorMessage.includes("Invalid secret")
        ) {
          // Couvre deux causes distinctes : mot de passe erroné à la connexion,
          // et mot de passe trop court à l'inscription (le serveur en exige 8).
          toast.error(
            credentialsFlow === "signUp"
              ? "Password must be at least 8 characters."
              : "Incorrect password.",
          );
        } else if (errorMessage.includes("InvalidAccountId")) {
          toast.error("No account found with this email.");
        } else if (errorMessage.includes("Invalid email")) {
          toast.error("Invalid email.");
        } else {
          toast.error("Unable to sign in. Please try again.");
        }
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const handleVerification = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    signIn("password", formData)
      .then((result) => {
        // Ici, contrairement à l'étape précédente, un code refusé ne lève pas
        // toujours : la lib peut se contenter de ne renvoyer aucun token.
        // Traiter `signingIn: false` comme un succès laisserait l'utilisateur
        // sur un écran figé sans explication.
        if (!result.signingIn) {
          toast.error("Invalid or expired code.");
          return;
        }
        toast.success("Email verified!");
      })
      .catch((e) => {
        console.error(e);
        toast.error("Invalid or expired code.");
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const handleForgot = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "");

    signIn("password", formData)
      .then(() => {
        setStep({ email, kind: "reset" });
        toast.success("We sent a reset code to your email.");
      })
      .catch((e) => {
        console.error(e);
        // Une `ConvexError` porte un message écrit pour l'utilisateur (quota
        // d'envoi dépassé, avec le délai d'attente). Le laisser filer jusqu'aux
        // branches génériques ci-dessous l'écraserait par un texte plus vague.
        if (e instanceof ConvexError && typeof e.data === "string") {
          toast.error(e.data);
          return;
        }
        const errorMessage = e?.message || String(e);
        // Message explicite plutôt que neutre : le formulaire de connexion dit
        // déjà « No account found with this email », donc taire l'information
        // ici ne fermerait rien. Surtout, un utilisateur inscrit via Google
        // resterait sinon devant un champ de code, à attendre un email qui
        // n'arrivera jamais.
        if (errorMessage.includes("InvalidAccountId")) {
          toast.error(
            "No password sign-in for this email. If you signed up with Google, use Continue with Google.",
          );
        } else if (errorMessage.includes("Invalid email")) {
          toast.error("Invalid email.");
        } else {
          toast.error("Could not send the reset code. Please try again.");
        }
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const handleResetVerification = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);

    signIn("password", formData)
      .then((result) => {
        if (!result.signingIn) {
          toast.error("Invalid or expired code.");
          return;
        }
        toast.success("Password updated!");
      })
      .catch((e) => {
        console.error(e);
        // Une `ConvexError` porte un message écrit pour l'utilisateur (quota
        // d'envoi dépassé, avec le délai d'attente). Le laisser filer jusqu'aux
        // branches génériques ci-dessous l'écraserait par un texte plus vague.
        if (e instanceof ConvexError && typeof e.data === "string") {
          toast.error(e.data);
          return;
        }
        const errorMessage = e?.message || String(e);
        // Le serveur valide la longueur AVANT de regarder le code : un mot de
        // passe trop court échoue donc sans que le code soit en cause, et dire
        // « code invalide » enverrait l'utilisateur corriger le mauvais champ.
        if (errorMessage.includes("Invalid password")) {
          toast.error("Password must be at least 8 characters.");
        } else {
          toast.error("Invalid or expired code.");
        }
      })
      .finally(() => {
        setIsSubmitting(false);
      });
  };

  const heading = codeStep
    ? codeStep.kind === "reset"
      ? "Choose a new password"
      : "Check your email"
    : step === "forgot"
      ? "Reset your password"
      : credentialsFlow === "signIn"
        ? "Welcome back"
        : "Create an account";

  return (
    <div className="min-h-screen w-screen bg-[#f7f7f8] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[360px] flex flex-col items-center gap-8">
        {/* Logo */}
        <img
          src="/favicon.svg"
          alt="Nolenor"
          className="h-16 w-16 animate-appear-zoom"
        />

        {/* Header */}
        <div
          className="text-center flex flex-col gap-2 animate-appear-up"
          style={{ animationDelay: "80ms" }}
        >
          <h1 className="text-2xl font-bold text-gray-900">{heading}</h1>
          <p className="text-sm text-gray-500">
            {codeStep ? (
              <>
                We sent a code to{" "}
                <span className="text-gray-900">{codeStep.email}</span>
              </>
            ) : step === "forgot" ? (
              "We'll email you a code to choose a new password"
            ) : credentialsFlow === "signIn" ? (
              "Sign in to your account to continue"
            ) : (
              "Sign up to get started for free"
            )}
          </p>
        </div>

        {codeStep?.kind === "reset" ? (
          <form
            className="w-full flex flex-col gap-3 animate-appear-up"
            style={{ animationDelay: "160ms" }}
            onSubmit={handleResetVerification}
          >
            <Input
              name="code"
              placeholder="8-digit code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              disabled={isSubmitting}
              className={INPUT_CLASSNAME}
            />
            <Input
              name="newPassword"
              placeholder="New password"
              type="password"
              autoComplete="new-password"
              required
              disabled={isSubmitting}
              minLength={8}
              className={INPUT_CLASSNAME}
            />
            <input name="email" type="hidden" value={codeStep.email} />
            <input name="flow" type="hidden" value="reset-verification" />

            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-11 mt-1 bg-(--brand) hover:opacity-90 text-white font-medium border-0"
            >
              {isSubmitting ? (
                <div className={SPINNER_CLASSNAME} />
              ) : (
                "Update password"
              )}
            </Button>
          </form>
        ) : codeStep ? (
          <form
            className="w-full flex flex-col gap-3 animate-appear-up"
            style={{ animationDelay: "160ms" }}
            onSubmit={handleVerification}
          >
            <Input
              name="code"
              placeholder="8-digit code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              required
              disabled={isSubmitting}
              className={INPUT_CLASSNAME}
            />
            <input name="email" type="hidden" value={codeStep.email} />
            <input name="flow" type="hidden" value="email-verification" />

            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-11 mt-1 bg-(--brand) hover:opacity-90 text-white font-medium border-0"
            >
              {isSubmitting ? <div className={SPINNER_CLASSNAME} /> : "Continue"}
            </Button>
          </form>
        ) : step === "forgot" ? (
          <form
            className="w-full flex flex-col gap-3 animate-appear-up"
            style={{ animationDelay: "160ms" }}
            onSubmit={handleForgot}
          >
            <Input
              name="email"
              placeholder="name@example.com"
              type="email"
              autoFocus
              required
              disabled={isSubmitting}
              className={INPUT_CLASSNAME}
            />
            <input name="flow" type="hidden" value="reset" />

            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-11 mt-1 bg-(--brand) hover:opacity-90 text-white font-medium border-0"
            >
              {isSubmitting ? <div className={SPINNER_CLASSNAME} /> : "Send code"}
            </Button>
          </form>
        ) : (
          <div className="w-full flex flex-col gap-4">
            {/* Google */}
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogle}
              disabled={isBusy}
              className="h-11 w-full bg-white border-gray-200 text-gray-700 font-medium shadow-none hover:bg-gray-50 hover:text-gray-900 animate-appear-up"
              style={{ animationDelay: "160ms" }}
            >
              {isGoogleRedirecting ? (
                <div className="h-4 w-4 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
              ) : (
                <>
                  <FcGoogle />
                  Continue with Google
                </>
              )}
            </Button>

            {/* Séparateur */}
            <div
              className="flex items-center gap-3 animate-appear"
              style={{ animationDelay: "200ms" }}
            >
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs text-gray-400">or</span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            {/* Email + mot de passe */}
            <form
              className="w-full flex flex-col gap-3 animate-appear-up"
              style={{ animationDelay: "240ms" }}
              onSubmit={handleCredentials}
            >
              <Input
                name="email"
                placeholder="name@example.com"
                type="email"
                required
                disabled={isBusy}
                className={INPUT_CLASSNAME}
              />
              <Input
                name="password"
                placeholder="Password"
                type="password"
                required
                disabled={isBusy}
                // Le serveur en exige 8 (`validateDefaultPasswordRequirements`).
                // À 6, l'inscription échouait côté serveur avec un message qui
                // parlait de mot de passe incorrect.
                minLength={8}
                className={INPUT_CLASSNAME}
              />
              <input name="flow" type="hidden" value={credentialsFlow} />

              {credentialsFlow === "signIn" && (
                <div className="flex justify-end -mt-1">
                  <button
                    type="button"
                    className="text-xs text-gray-400 underline underline-offset-2 hover:text-gray-600 transition-colors"
                    onClick={() => setStep("forgot")}
                    disabled={isBusy}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              <Button
                type="submit"
                disabled={isBusy}
                className="h-11 mt-1 bg-(--brand) hover:opacity-90 text-white font-medium border-0"
              >
                {isSubmitting ? (
                  <div className={SPINNER_CLASSNAME} />
                ) : credentialsFlow === "signIn" ? (
                  "Sign In"
                ) : (
                  "Sign Up"
                )}
              </Button>
            </form>
          </div>
        )}

        {/* Bascule */}
        <p
          className="text-sm text-gray-400 animate-appear"
          style={{ animationDelay: "300ms" }}
        >
          {codeStep || step === "forgot" ? (
            <button
              type="button"
              className="text-gray-600 underline underline-offset-2 hover:text-gray-900 transition-colors"
              onClick={() => setStep("signIn")}
              disabled={isSubmitting}
            >
              Back to sign in
            </button>
          ) : credentialsFlow === "signIn" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="text-gray-600 underline underline-offset-2 hover:text-gray-900 transition-colors"
                onClick={() => setStep("signUp")}
                disabled={isBusy}
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="text-gray-600 underline underline-offset-2 hover:text-gray-900 transition-colors"
                onClick={() => setStep("signIn")}
                disabled={isBusy}
              >
                Sign In
              </button>
            </>
          )}
        </p>
      </div>

      {/* Footer */}
      <footer
        className="absolute bottom-8 flex flex-col items-center gap-2 animate-appear"
        style={{ animationDelay: "320ms" }}
      >
        <div className="flex items-center gap-3 text-xs text-gray-400">
          <a href="#" className="hover:text-gray-500 transition-colors">
            Terms
          </a>
          <span>|</span>
          <a href="#" className="hover:text-gray-500 transition-colors">
            Privacy
          </a>
          <span>|</span>
          <a href="#" className="hover:text-gray-500 transition-colors">
            Feedback
          </a>
        </div>
        <p className="text-xs text-gray-400">
          © 2026 Nolënor. All rights reserved.
        </p>
      </footer>
    </div>
  );
}
