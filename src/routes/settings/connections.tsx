import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAction, useMutation, useQuery } from "convex/react";
import toast from "react-hot-toast";
import { TbCopy, TbPlus, TbTrash } from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";

export const Route = createFileRoute("/settings/connections")({
  component: ConnectionsSettingsPage,
});

const MCP_URL = `${((import.meta.env.VITE_CONVEX_URL as string) ?? "").replace(
  ".convex.cloud",
  ".convex.site",
)}/mcp`;

const claudeCodeSnippet = `claude mcp add --transport http nolenor ${MCP_URL} --header "Authorization: Bearer YOUR_API_KEY"`;

const claudeDesktopSnippet = JSON.stringify(
  {
    mcpServers: {
      nolenor: {
        command: "npx",
        args: [
          "-y",
          "mcp-remote",
          MCP_URL,
          "--header",
          "Authorization: Bearer YOUR_API_KEY",
        ],
      },
    },
  },
  null,
  2,
);

function copyToClipboard(text: string) {
  navigator.clipboard
    .writeText(text)
    .then(() => toast.success("Copied to clipboard"))
    .catch(() => toast.error("Could not copy to clipboard"));
}

function CodeBlock({ code }: { code: string }) {
  return (
    <div className="relative group">
      <pre className="text-xs bg-gray-50 border border-gray-300 rounded-md p-3 pr-10 overflow-x-auto whitespace-pre-wrap break-all">
        {code}
      </pre>
      <button
        type="button"
        onClick={() => copyToClipboard(code)}
        className="absolute top-2 right-2 p-1.5 rounded-md text-gray-500 hover:bg-gray-200"
        title="Copy"
      >
        <TbCopy size={14} />
      </button>
    </div>
  );
}

function formatDate(timestamp?: number) {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleDateString();
}

function ConnectionsSettingsPage() {
  const keys = useQuery(api.apiKeys.list);
  const createKey = useAction(api.apiKeys.create);
  const revokeKey = useMutation(api.apiKeys.revoke);

  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<{ name: string; key: string } | null>(
    null,
  );

  const handleCreate = async () => {
    if (!name.trim() || creating) return;
    setCreating(true);
    try {
      const created = await createKey({ name });
      setNewKey({ name: created.name, key: created.key });
      setName("");
    } catch (error) {
      console.error("API key creation error:", error);
      toast.error("Could not create the API key");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (keyId: Id<"apiKeys">) => {
    try {
      await revokeKey({ keyId });
      toast.success("API key revoked");
    } catch (error) {
      console.error("API key revoke error:", error);
      toast.error("Could not revoke the API key");
    }
  };

  return (
    <div className="max-w-3xl space-y-8 overflow-y-auto h-full pr-2">
      <div className="space-y-2">
        <h1 className="text-lg font-bold">MCP connections</h1>
        <p className="text-sm text-gray-500">
          Connect a third-party assistant (Claude Code, Claude Desktop…) to
          Nolënor through the Model Context Protocol. The assistant gets the
          same canvas tools as Nolë: browse, search, create and edit nodes on
          the canvases you have access to.
        </p>
      </div>

      {/* API keys */}
      <section className="space-y-3">
        <h2 className="text-md font-semibold">API keys</h2>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Key name (e.g. Claude Code on my laptop)"
            className="max-w-sm"
          />
          <Button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim() || creating}
          >
            <TbPlus /> Create key
          </Button>
        </div>

        {newKey && (
          <div className="border border-amber-300 bg-amber-50 rounded-md p-3 space-y-2">
            <p className="text-sm font-medium text-amber-800">
              Key “{newKey.name}” created. Copy it now — it will not be shown
              again.
            </p>
            <CodeBlock code={newKey.key} />
          </div>
        )}

        {keys === undefined ? (
          <p className="text-sm text-gray-500 italic">Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No API keys yet.</p>
        ) : (
          <div className="divide-y divide-gray-300 border border-gray-300 bg-gray-50 rounded-md">
            {keys.map((key) => (
              <div
                key={key._id}
                className="flex items-center justify-between p-2 gap-3"
              >
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium truncate ${key.revoked ? "text-gray-400 line-through" : "text-gray-700"}`}
                  >
                    {key.name}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">
                    {key.prefix}… · created {formatDate(key.createdAt)} · last
                    used {formatDate(key.lastUsedAt)}
                  </p>
                </div>
                {!key.revoked && (
                  <button
                    type="button"
                    onClick={() => handleRevoke(key._id)}
                    className="p-1.5 rounded-md text-red-600 hover:bg-red-50 shrink-0"
                    title="Revoke this key"
                  >
                    <TbTrash size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Connection instructions */}
      <section className="space-y-3">
        <h2 className="text-md font-semibold">Connect Claude Code</h2>
        <p className="text-sm text-gray-500">
          Run this command, replacing <code>YOUR_API_KEY</code> with a key
          created above:
        </p>
        <CodeBlock code={claudeCodeSnippet} />
      </section>

      <section className="space-y-3 pb-8">
        <h2 className="text-md font-semibold">Connect Claude Desktop</h2>
        <p className="text-sm text-gray-500">
          Add this to your <code>claude_desktop_config.json</code> (Settings →
          Developer → Edit Config), replacing <code>YOUR_API_KEY</code>:
        </p>
        <CodeBlock code={claudeDesktopSnippet} />
      </section>
    </div>
  );
}
