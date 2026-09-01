import { useState } from "react";
import { useAction, useMutation } from "convex/react";
import { TbAlertTriangle, TbCheck, TbPlugConnectedX } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import ConfirmableButton from "@/components/ui/ConfirmableButton";
import { Spinner } from "@/components/shadcn/spinner";
import { toastError } from "@/components/utils/errorUtils";
import { resolveProviderIcon } from "./providerIcons";

export type Connection = {
  _id: Id<"connections">;
  provider: string;
  label: string;
  scopes: string[];
  status: "active" | "needs_reauth";
  lastError?: string;
  lastUsedAt?: number;
  createdAt: number;
};

type TestResult = { ok: boolean; summary: string };

export default function ConnectionCard({
  connection,
  providerLabel,
  providerIcon,
  onReconnect,
  reconnecting,
}: {
  connection: Connection;
  providerLabel: string;
  providerIcon: string;
  onReconnect: () => void;
  reconnecting: boolean;
}) {
  const disconnect = useMutation(api.connections.disconnect);
  const testConnection = useAction(api.connections.testConnection);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);

  const Icon = resolveProviderIcon(providerIcon);
  const needsReauth = connection.status === "needs_reauth";

  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      setResult(await testConnection({ connectionId: connection._id }));
    } catch (err) {
      toastError(err, "The connection test failed");
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnect({ connectionId: connection._id });
    } catch (err) {
      toastError(err, "Failed to disconnect this account");
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Icon size={20} className="mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <div className="font-medium">{connection.label}</div>
            <div className="text-xs text-muted-foreground">
              {providerLabel} · connected{" "}
              {new Date(connection.createdAt).toLocaleDateString()}
              {connection.lastUsedAt
                ? ` · last used ${new Date(connection.lastUsedAt).toLocaleDateString()}`
                : null}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {needsReauth ? (
            <Button size="sm" onClick={onReconnect} disabled={reconnecting}>
              {reconnecting ? <Spinner className="size-4" /> : "Reconnect"}
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleTest()}
              disabled={testing}
            >
              {testing ? <Spinner className="size-4" /> : "Test"}
            </Button>
          )}
          <ConfirmableButton
            title={`Disconnect ${connection.label}?`}
            text="Nolënor will no longer be able to reach this account, and its stored credentials are deleted."
            confirmLabel="Disconnect"
            destructive
            onConfirm={() => void handleDisconnect()}
          >
            <Button variant="ghost" size="sm" title="Disconnect">
              <TbPlugConnectedX size={16} />
            </Button>
          </ConfirmableButton>
        </div>
      </div>

      {needsReauth ? (
        <div className="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          <TbAlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            {connection.lastError ??
              "This connection is no longer accepted by the provider."}
          </span>
        </div>
      ) : null}

      {result ? (
        <div
          className={`flex items-start gap-2 rounded-md p-2 text-xs ${
            result.ok
              ? "bg-emerald-50 text-emerald-900"
              : "bg-red-50 text-red-900"
          }`}
        >
          {result.ok ? (
            <TbCheck size={14} className="mt-0.5 shrink-0" />
          ) : (
            <TbAlertTriangle size={14} className="mt-0.5 shrink-0" />
          )}
          <span>{result.summary}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1">
        {connection.scopes.map((scope) => (
          <span
            key={scope}
            className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            title={scope}
          >
            {scope.replace(/^https:\/\/www\.googleapis\.com\/auth\//, "")}
          </span>
        ))}
      </div>
    </div>
  );
}
