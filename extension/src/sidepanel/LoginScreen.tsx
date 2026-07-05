import { useAuthActions } from "@convex-dev/auth/react";
import { useState } from "react";
import toast from "react-hot-toast";

export default function LoginScreen() {
  const { signIn } = useAuthActions();
  const [step, setStep] = useState<"signIn" | "signUp">("signIn");
  const [isSubmitting, setIsSubmitting] = useState(false);

  return (
    <div className="h-full flex flex-col items-center justify-center px-6 bg-background">
      <div className="w-full flex flex-col items-center gap-6">
        <div className="text-center flex flex-col gap-1">
          <h1 className="text-xl font-semibold text-foreground">
            {step === "signIn" ? "Welcome back" : "Create an account"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {step === "signIn"
              ? "Sign in to your Nolenor account"
              : "Sign up to get started"}
          </p>
        </div>

        <form
          className="w-full flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setIsSubmitting(true);
            const formData = new FormData(event.currentTarget);
            signIn("password", formData)
              .then(() => {
                toast.success(
                  step === "signIn" ? "Successfully signed in!" : "Account created!",
                );
              })
              .catch((e) => {
                console.error(e);
                const errorMessage = e?.message || String(e);
                if (errorMessage.includes("already exists")) {
                  toast.error("This account already exists.");
                } else if (
                  errorMessage.includes("Invalid password") ||
                  errorMessage.includes("invalid password") ||
                  errorMessage.includes("Invalid secret")
                ) {
                  toast.error("Incorrect password.");
                } else if (errorMessage.includes("InvalidAccountId")) {
                  toast.error("No account found with this email.");
                } else if (errorMessage.includes("Invalid email")) {
                  toast.error("Invalid email.");
                } else {
                  toast.error("Unable to sign in. Please try again.");
                }
              })
              .finally(() => setIsSubmitting(false));
          }}
        >
          <input
            name="email"
            placeholder="name@example.com"
            type="email"
            required
            disabled={isSubmitting}
            className="w-full h-10 px-3 rounded-lg bg-background border border-border text-base text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-(--brand) disabled:opacity-50"
          />
          <input
            name="password"
            placeholder="Password"
            type="password"
            required
            disabled={isSubmitting}
            minLength={6}
            className="w-full h-10 px-3 rounded-lg bg-background border border-border text-base text-foreground placeholder:text-muted-foreground/60 outline-none focus:border-(--brand) disabled:opacity-50"
          />
          <input name="flow" type="hidden" value={step} />

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-10 mt-1 rounded-lg font-medium text-base text-white bg-(--brand) transition-all active:scale-[0.98] hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="inline-block h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : step === "signIn" ? (
              "Sign In"
            ) : (
              "Sign Up"
            )}
          </button>
        </form>

        <p className="text-sm text-muted-foreground">
          {step === "signIn" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="text-foreground/70 underline underline-offset-2 hover:text-foreground"
                onClick={() => setStep("signUp")}
                disabled={isSubmitting}
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="text-foreground/70 underline underline-offset-2 hover:text-foreground"
                onClick={() => setStep("signIn")}
                disabled={isSubmitting}
              >
                Sign In
              </button>
            </>
          )}
        </p>
      </div>

      <div className="mt-auto pb-4 text-sm text-muted-foreground/70">
        Nolenor Extension
      </div>
    </div>
  );
}