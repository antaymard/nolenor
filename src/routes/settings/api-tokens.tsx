import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { TbExclamationCircle, TbEye, TbEyeOff } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import CreateApiTokenDialog from "@/components/settings/apiTokens/CreateApiTokenDialog";
import ApiTokensList from "@/components/settings/apiTokens/ApiTokensList";

export const Route = createFileRoute("/settings/api-tokens")({
  component: RouteComponent,
});

function RouteComponent() {
  const tokens = useQuery(api.apiTokens.list);
  // Les tokens révoqués sont masqués par défaut : ils ne servent plus qu'à
  // l'historique, et une liste qui accumule les révocations noie les tokens
  // encore actifs.
  const [showRevoked, setShowRevoked] = useState(false);

  const revokedCount = useMemo(
    () => (tokens ?? []).filter((t) => t.revokedAt !== undefined).length,
    [tokens],
  );

  const visibleTokens = useMemo(() => {
    if (!tokens) return tokens;
    return showRevoked
      ? tokens
      : tokens.filter((t) => t.revokedAt === undefined);
  }, [tokens, showRevoked]);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">API tokens</h1>
          <i className="text-sm text-muted-foreground not-italic">
            Create tokens to let third-party tools and agents (e.g. MCP
            servers) access the nolënor API on your behalf.
          </i>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {revokedCount > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowRevoked((v) => !v)}
              aria-pressed={showRevoked}
            >
              {showRevoked ? <TbEyeOff /> : <TbEye />}
              {showRevoked
                ? `Hide revoked (${revokedCount})`
                : `Show revoked (${revokedCount})`}
            </Button>
          )}
          <CreateApiTokenDialog />
        </div>
      </div>

      <div className="mt-4 rounded bg-slate-50 p-2">
        {visibleTokens && visibleTokens.length > 0 && (
          <ApiTokensList tokens={visibleTokens} />
        )}
        {visibleTokens && visibleTokens.length === 0 && (
          <div className="ml-2 mt-2 flex items-center gap-2">
            <TbExclamationCircle />
            {revokedCount > 0
              ? "No active API token — only revoked ones."
              : "No API tokens yet"}
          </div>
        )}
      </div>
    </div>
  );
}
