import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import toast from "react-hot-toast";
import { TbLogout } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import { Button } from "@/components/shadcn/button";
import ConfirmableButton from "@/components/ui/ConfirmableButton";

export const Route = createFileRoute("/settings/account")({
  component: RouteComponent,
});

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-gray-200 px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-40 shrink-0 text-sm text-muted-foreground">
        {label}
      </span>
      <span className="min-w-0 truncate text-sm">{value}</span>
    </div>
  );
}

function RouteComponent() {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("You have been signed out");
      navigate({ to: "/signin" });
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Error signing out");
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">Account</h1>
        <i className="text-sm text-muted-foreground not-italic">
          The identity nolënor knows you by. It comes from the provider you
          signed in with, so it is not editable here.
        </i>
      </div>

      <div className="mt-4 rounded-md border border-gray-200 bg-white">
        {me === undefined ? (
          <p className="px-3 py-2.5 text-sm text-gray-500 italic">Loading…</p>
        ) : me === null ? (
          <p className="px-3 py-2.5 text-sm text-gray-500">
            You are not signed in.
          </p>
        ) : (
          <>
            <Row label="Name" value={me.name ?? "—"} />
            <Row label="Email" value={me.email ?? "—"} />
            {/* Utile au support : c'est cet id qui apparaît dans les logs et
                les rapports d'erreur. */}
            <Row label="User ID" value={me._id} />
          </>
        )}
      </div>

      <div className="mt-6">
        <ConfirmableButton
          title="Sign out?"
          text="You will need to sign in again to get back to your canvases."
          confirmLabel="Sign out"
          destructive
          onConfirm={() => void handleLogout()}
        >
          <Button
            type="button"
            variant="outline"
            className="text-red-600 hover:text-red-700"
          >
            <TbLogout />
            Sign out
          </Button>
        </ConfirmableButton>
      </div>
    </div>
  );
}
