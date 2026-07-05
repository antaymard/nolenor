import { Link } from "@tanstack/react-router";
import { Button } from "@/components/shadcn/button";

export default function AuthUpgradeBanner() {
  return (
    <div className="pointer-events-auto flex min-w-88 max-w-3xl items-center justify-between gap-4 rounded-2xl border bg-card/95 px-5 py-4 shadow-lg backdrop-blur">
      <div className="flex flex-col gap-1 text-left">
        <span className="text-sm font-semibold text-foreground">
          Viewing a public canvas
        </span>
        <p className="text-sm text-muted-foreground">
          Sign in or create an account to duplicate, edit, and keep your own
          workspaces.
        </p>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <Link to="/signin">Sign in / Create account</Link>
      </Button>
    </div>
  );
}
