import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useState, useEffect } from "react";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import toast from "react-hot-toast";
import { useConvexAuth } from "convex/react";

export const Route = createFileRoute("/signin")({
  component: RouteComponent,
});

function RouteComponent() {
  const { signIn } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [step, setStep] = useState<"signUp" | "signIn">("signIn");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      navigate({ to: "/" });
    }
  }, [isAuthenticated, isLoading, navigate]);

  return (
    <div className="min-h-screen w-screen bg-[#f7f7f8] flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-[360px] flex flex-col items-center gap-8">
        {/* Logo */}
        <img src="/favicon.svg" alt="Nolenor" className="h-16 w-16" />

        {/* Header */}
        <div className="text-center flex flex-col gap-2">
          <h1 className="text-2xl font-bold text-gray-900">
            {step === "signIn" ? "Welcome back" : "Create an account"}
          </h1>
          <p className="text-sm text-gray-500">
            {step === "signIn"
              ? "Sign in to your account to continue"
              : "Sign up to get started for free"}
          </p>
        </div>

        {/* Form */}
        <form
          className="w-full flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            setIsSubmitting(true);
            const formData = new FormData(event.currentTarget);
            signIn("password", formData)
              .then(() => {
                toast.success(
                  step === "signIn"
                    ? "Successfully signed in!"
                    : "Account created successfully!",
                );
              })
              .catch((e) => {
                console.error(e);
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
                  toast.error("Incorrect password.");
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
          }}
        >
          <Input
            name="email"
            placeholder="name@example.com"
            type="email"
            required
            disabled={isSubmitting}
            className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-300 h-11 focus-visible:ring-0 focus-visible:border-gray-300"
          />
          <Input
            name="password"
            placeholder="Password"
            type="password"
            required
            disabled={isSubmitting}
            minLength={6}
            className="bg-white border-gray-200 text-gray-900 placeholder:text-gray-300 h-11 focus-visible:ring-0 focus-visible:border-gray-300"
          />
          <input name="flow" type="hidden" value={step} />

          <Button
            type="submit"
            disabled={isSubmitting}
            className="h-11 mt-1 bg-(--brand) hover:opacity-90 text-white font-medium border-0"
          >
            {isSubmitting ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : step === "signIn" ? (
              "Sign In"
            ) : (
              "Sign Up"
            )}
          </Button>
        </form>

        {/* Toggle */}
        <p className="text-sm text-gray-400">
          {step === "signIn" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="text-gray-600 underline underline-offset-2 hover:text-gray-900 transition-colors"
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
                className="text-gray-600 underline underline-offset-2 hover:text-gray-900 transition-colors"
                onClick={() => setStep("signIn")}
                disabled={isSubmitting}
              >
                Sign In
              </button>
            </>
          )}
        </p>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-8 flex flex-col items-center gap-2">
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
