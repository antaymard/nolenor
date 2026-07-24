import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import { TbExclamationCircle } from "react-icons/tb";
import CreateApiTokenDialog from "@/components/settings/apiTokens/CreateApiTokenDialog";
import ApiTokensList from "@/components/settings/apiTokens/ApiTokensList";

export const Route = createFileRoute("/settings/api-tokens")({
  component: RouteComponent,
});

function RouteComponent() {
  const tokens = useQuery(api.apiTokens.list);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">API tokens</h1>
          <i className="text-sm text-muted-foreground not-italic">
            Create tokens to let third-party tools and agents (e.g. MCP
            servers) access the nolënor API on your behalf.
          </i>
        </div>
        <CreateApiTokenDialog />
      </div>

      <div className="mt-4 bg-slate-50 rounded p-2">
        {tokens && tokens.length > 0 && <ApiTokensList tokens={tokens} />}
        {tokens && tokens.length === 0 && (
          <div className="ml-2 mt-2 flex items-center gap-2">
            <TbExclamationCircle /> No API tokens yet
          </div>
        )}
      </div>
    </div>
  );
}
