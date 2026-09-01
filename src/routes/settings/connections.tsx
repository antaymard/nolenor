import { useEffect, useMemo, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import toast from "react-hot-toast";
import { z } from "zod";
import { api } from "@/../convex/_generated/api";
import ConnectionCard from "@/components/settings/connections/ConnectionCard";
import ProviderRow from "@/components/settings/connections/ProviderRow";
import { useStartConnection } from "@/components/settings/connections/useStartConnection";
import { Skeleton } from "@/components/shadcn/skeleton";

// Le retour du consentement atterrit ici avec `?connected=google` ou
// `?error=...` (cf. la route /integrations/oauth/callback de convex/http.ts).
const connectionsSearchSchema = z.object({
  connected: z.string().optional(),
  error: z.string().optional(),
});

export const Route = createFileRoute("/settings/connections")({
  component: ConnectionsSettingsPage,
  validateSearch: connectionsSearchSchema,
});

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: "You declined the consent screen.",
  missing_code: "The provider came back without an authorization code.",
  unknown_provider: "This service is no longer supported.",
  identity_failed:
    "The account could not be identified — the granted scopes may be too narrow.",
  exchange_failed: "The token exchange failed. Try connecting again.",
};

function ConnectionsSettingsPage() {
  const connections = useQuery(api.connections.list);
  const catalog = useQuery(api.connections.catalog);
  const { connected, error } = Route.useSearch();
  const navigate = useNavigate();
  const { start, startingProvider } = useStartConnection();

  // Le retour d'OAuth ne doit être annoncé qu'une fois : sans ce garde, un
  // re-render (une query qui se rafraîchit) rejouerait le toast.
  const announcedRef = useRef(false);
  useEffect(() => {
    if (!connected && !error) return;
    if (announcedRef.current) return;
    announcedRef.current = true;

    if (error) {
      toast.error(
        OAUTH_ERROR_MESSAGES[error] ?? `The connection failed (${error}).`,
      );
    } else {
      toast.success("Account connected.");
    }

    // On efface les paramètres pour qu'un rechargement de page ne rejoue pas
    // l'annonce, et que l'URL reste partageable.
    void navigate({
      to: "/settings/connections",
      search: {},
      replace: true,
    });
  }, [connected, error, navigate]);

  const connectionsByProvider = useMemo(() => {
    const map = new Map<string, NonNullable<typeof connections>>();
    for (const connection of connections ?? []) {
      const list = map.get(connection.provider) ?? [];
      list.push(connection);
      map.set(connection.provider, list);
    }
    return map;
  }, [connections]);

  const isLoading = connections === undefined || catalog === undefined;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold">Connections</h1>
        <i className="text-sm text-muted-foreground not-italic">
          Link the accounts Nolënor may read from and act on. Credentials are
          encrypted and never leave the server — nothing that can identify an
          account is exposed to the canvas or to generated code.
        </i>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-6">
          {(catalog ?? []).map((provider) => {
            const providerConnections =
              connectionsByProvider.get(provider.id) ?? [];
            return (
              <section key={provider.id} className="space-y-3">
                {providerConnections.map((connection) => (
                  <ConnectionCard
                    key={connection._id}
                    connection={connection}
                    providerLabel={provider.label}
                    providerIcon={provider.icon}
                    reconnecting={startingProvider === provider.id}
                    onReconnect={() => void start(provider.id, provider.label)}
                  />
                ))}
                <ProviderRow
                  provider={provider}
                  connectedCount={providerConnections.length}
                  starting={startingProvider === provider.id}
                  onConnect={() => void start(provider.id, provider.label)}
                />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
