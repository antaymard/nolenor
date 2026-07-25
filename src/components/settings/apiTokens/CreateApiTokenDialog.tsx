import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { toastError } from "@/components/utils/errorUtils";
import {
  buildClaudeCodeCommand,
  getMcpEndpointUrl,
} from "@/lib/mcpEndpoint";
import toast from "react-hot-toast";
import { TbCopy, TbPlus } from "react-icons/tb";

type ApiTokenPermission = "read" | "write";

export default function CreateApiTokenDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [permission, setPermission] = useState<ApiTokenPermission>("read");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  const createApiToken = useMutation(api.apiTokens.create);

  const resetAndClose = () => {
    setOpen(false);
    setName("");
    setPermission("read");
    setCreatedToken(null);
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      resetAndClose();
      return;
    }
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsSubmitting(true);
    try {
      const result = await createApiToken({ name: name.trim(), permission });
      setCreatedToken(result.token);
    } catch (err) {
      toastError(err, "Failed to create token");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied to clipboard`);
    } catch (err) {
      toastError(err, `Failed to copy ${label.toLowerCase()}`);
    }
  };

  const mcpEndpointUrl = getMcpEndpointUrl();
  const claudeCodeCommand =
    createdToken && mcpEndpointUrl
      ? buildClaudeCodeCommand(mcpEndpointUrl, createdToken)
      : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <TbPlus />
          New token
        </Button>
      </DialogTrigger>
      <DialogContent className={createdToken ? "sm:max-w-2xl" : undefined}>
        {createdToken ? (
          <>
            <DialogHeader>
              <DialogTitle>Token created</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                Copy this token now. For security reasons, it will not be
                shown again.
              </p>
              <div className="flex flex-col gap-1.5">
                <Label>Token</Label>
                <div className="flex items-center gap-2">
                  <Input
                    readOnly
                    value={createdToken}
                    className="h-11 font-mono text-base"
                    onFocus={(e) => e.currentTarget.select()}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    title="Copy token"
                    onClick={() => handleCopy(createdToken, "Token")}
                  >
                    <TbCopy />
                  </Button>
                </div>
              </div>
              {claudeCodeCommand && (
                <div className="flex flex-col gap-1.5">
                  <Label>Connect Claude Code</Label>
                  <div className="flex items-start gap-2">
                    <pre className="min-w-0 flex-1 rounded-md border bg-muted p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all">
                      {claudeCodeCommand}
                    </pre>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      title="Copy command"
                      onClick={() => handleCopy(claudeCodeCommand, "Command")}
                    >
                      <TbCopy />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Run it as a single line. Other MCP clients need the
                    endpoint URL{" "}
                    <span className="font-mono">{mcpEndpointUrl}</span> with an{" "}
                    <span className="font-mono">Authorization: Bearer</span>{" "}
                    header.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button type="button" onClick={resetAndClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New API token</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="token-name">Name</Label>
                <Input
                  id="token-name"
                  placeholder="e.g. My MCP agent"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Permission</Label>
                <Select
                  value={permission}
                  onValueChange={(v) =>
                    setPermission(v as ApiTokenPermission)
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read">Read</SelectItem>
                    <SelectItem value="write">Write</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting || !name.trim()}>
                  {isSubmitting ? "Creating..." : "Create token"}
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
