import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import { resolveProviderIcon } from "./providerIcons";

export type ProviderEntry = {
  id: string;
  label: string;
  description: string;
  icon: string;
  scopes: string[];
  configured: boolean;
  callbackUrl?: string;
  envNames: string[];
};

/**
 * Une ligne du catalogue : ce qu'on peut brancher, et le bouton qui part
 * chercher le consentement.
 */
export default function ProviderRow({
  provider,
  connectedCount,
  starting,
  onConnect,
}: {
  provider: ProviderEntry;
  connectedCount: number;
  starting: boolean;
  onConnect: () => void;
}) {
  const Icon = resolveProviderIcon(provider.icon);

  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-dashed p-4">
      <div className="flex items-start gap-3">
        <Icon size={20} className="mt-0.5 shrink-0" />
        <div className="space-y-1">
          <div className="font-medium">{provider.label}</div>
          <div className="text-xs text-muted-foreground">
            {provider.description}
          </div>
          {!provider.configured ? (
            <div className="space-y-1 pt-1 text-xs text-muted-foreground">
              <div>
                Not configured on this deployment yet. Set{" "}
                {provider.envNames.map((name, index) => (
                  <span key={name}>
                    {index > 0 ? " and " : null}
                    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      {name}
                    </code>
                  </span>
                ))}{" "}
                with `npx convex env set`.
              </div>
              {provider.callbackUrl ? (
                <div>
                  Redirect URI to register with {provider.label}:{" "}
                  <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                    {provider.callbackUrl}
                  </code>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <Button
        size="sm"
        variant={connectedCount > 0 ? "outline" : "default"}
        disabled={!provider.configured || starting}
        onClick={onConnect}
        className="shrink-0"
      >
        {starting ? (
          <Spinner className="size-4" />
        ) : connectedCount > 0 ? (
          "Add another account"
        ) : (
          "Connect"
        )}
      </Button>
    </div>
  );
}
