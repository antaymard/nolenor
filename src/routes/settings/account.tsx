import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useMutation, useQuery } from "convex/react";
import toast from "react-hot-toast";
import { TbLogout } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import { toastError } from "@/components/utils/errorUtils";

export const Route = createFileRoute("/settings/account")({
  component: RouteComponent,
});

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 border-b border-gray-200 px-3 py-2.5 last:border-b-0 sm:flex-row sm:items-center sm:gap-4">
      <span className="w-40 shrink-0 text-sm text-muted-foreground">
        {label}
      </span>
      <div className="min-w-0 flex-1 text-sm">{children}</div>
    </div>
  );
}

// Le champ édite `displayName` — le nom choisi par l'utilisateur — et non le
// `name` posé par le provider d'auth, qu'un login OAuth réécrit à chaque
// passage (cf. le commentaire de la table `users` dans convex/schema.ts).
// Laissé vide, il rend la main au nom du provider, proposé en placeholder.
function NameField({
  customName,
  providerName,
}: {
  customName: string;
  providerName?: string;
}) {
  const updateDisplayName = useMutation(api.users.updateDisplayName);
  const [draft, setDraft] = useState(customName);
  const [isSaving, setIsSaving] = useState(false);

  // Resynchronise sur la valeur serveur quand elle change réellement : après
  // notre propre save, ou depuis un autre onglet. Un `key` au montage ferait
  // le même travail, mais en démontant le champ — donc en perdant le focus à
  // chaque sauvegarde.
  useEffect(() => {
    setDraft(customName);
  }, [customName]);

  const trimmed = draft.trim();
  const isDirty = trimmed !== customName;

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await updateDisplayName({ displayName: trimmed });
      toast.success(trimmed ? "Name updated" : "Name cleared");
    } catch (error) {
      toastError(error, "Could not update your name");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-1">
      <form
        className="flex items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (isDirty && !isSaving) void handleSave();
        }}
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={providerName ?? "How Nolë should call you"}
          maxLength={80}
          className="max-w-xs"
          aria-label="Name"
        />
        <Button type="submit" size="sm" disabled={!isDirty || isSaving}>
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </form>
      {trimmed.length === 0 && providerName && (
        <p className="text-xs text-muted-foreground">
          Leave empty to keep “{providerName}”, the name your sign-in provider
          gave us.
        </p>
      )}
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
          Your name is what Nolë calls you — it is handed to the assistant with
          every conversation. The rest comes from the provider you signed in
          with.
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
            <Row label="Name">
              <NameField
                customName={me.customName ?? ""}
                providerName={me.providerName}
              />
            </Row>
            <Row label="Email">{me.email ?? "—"}</Row>
            {/* Utile au support : c'est cet id qui apparaît dans les logs et
                les rapports d'erreur. */}
            <Row label="User ID">
              <span className="font-mono text-xs">{me._id}</span>
            </Row>
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
