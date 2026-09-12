import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useCanvasStore } from "@/stores/canvasStore";
import { useCaptureFraming } from "@/hooks/useViewportFraming";
import { framingToParam } from "@/lib/canvasViewportFraming";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/shadcn/dialog";
import { Button } from "@/components/shadcn/button";
import { Input } from "@/components/shadcn/input";
import { Label } from "@/components/shadcn/label";
import { Separator } from "@/components/shadcn/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/shadcn/select";
import { Switch } from "@/components/shadcn/switch";
import { toastError } from "@/components/utils/errorUtils";
import toast from "react-hot-toast";
import { TbTrash } from "react-icons/tb";

export default function SharingModal() {
  const canvas = useCanvasStore((state) => state.canvas);
  const [open, setOpen] = useState(false);

  if (!canvas || canvas._permission !== "owner") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="hover:bg-accent flex items-center rounded-md"
          title="Share canvas"
        >
          Share
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share canvas</DialogTitle>
        </DialogHeader>
        <PublicLinkSection
          canvasId={canvas._id}
          isPublic={canvas.isPublic ?? false}
        />
        <Separator />
        <ViewLinkSection />
        <Separator />
        <ShareForm canvasId={canvas._id} />
        <ShareList canvasId={canvas._id} />
      </DialogContent>
    </Dialog>
  );
}

function PublicLinkSection({
  canvasId,
  isPublic,
}: {
  canvasId: Id<"canvases">;
  isPublic: boolean;
}) {
  const [isUpdating, setIsUpdating] = useState(false);
  const togglePublic = useMutation(api.canvases.togglePublic);

  const handlePublicToggle = async (checked: boolean) => {
    setIsUpdating(true);
    try {
      await togglePublic({
        canvasId,
        isPublic: checked,
      });
      toast.success(
        checked ? "Canvas is now public." : "Canvas is now private.",
      );
    } catch (err) {
      toastError(err, "Failed to update canvas visibility");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    } catch (err) {
      toastError(err, "Failed to copy link");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="public-canvas-switch">Public link</Label>
          <p className="text-xs text-muted-foreground">
            Anyone with the link can view this canvas.
          </p>
        </div>
        <Switch
          id="public-canvas-switch"
          checked={isPublic}
          onCheckedChange={handlePublicToggle}
          disabled={isUpdating}
        />
      </div>
      {isPublic && (
        <div className="flex justify-start">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCopyLink}
          >
            Copy link
          </Button>
        </div>
      )}
    </div>
  );
}

/**
 * Un lien vers le canvas *cadré comme on le voit* (`?v=cx,cy,zoom`).
 *
 * Volontairement hors de `PublicLinkSection` et donc non conditionné à
 * `isPublic` : un canvas partagé par email a autant besoin de pointer une zone
 * précise. Le « Copy link » ci-dessus reste, lui, le lien nu du canvas.
 *
 * `useCaptureFraming` exige le `ReactFlowProvider` : vrai pour les deux points
 * de montage de cette modale, `TopRightToolbar` (un `<Panel>` du canvas) et
 * `MobileTopBar` (sous le provider de `MobileCanvas`).
 */
function ViewLinkSection() {
  const captureFraming = useCaptureFraming();

  const handleCopyViewLink = async () => {
    const framing = captureFraming();
    if (!framing) {
      toast.error("The canvas is not ready yet.");
      return;
    }

    try {
      // Reconstruit depuis `origin` + `pathname` au lieu de partir de
      // `window.location.href` : le lien ne doit porter que `v`, et surtout pas
      // un `?template=` qui ouvrirait l'éditeur de template chez le
      // destinataire.
      const url =
        `${window.location.origin}${window.location.pathname}` +
        `?v=${framingToParam(framing)}`;
      await navigator.clipboard.writeText(url);
      toast.success("Link to this view copied to clipboard");
    } catch (err) {
      toastError(err, "Failed to copy link");
    }
  };

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Link to this view</span>
        <p className="text-xs text-muted-foreground">
          Opens the canvas framed exactly as you see it now.
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCopyViewLink}
      >
        Copy
      </Button>
    </div>
  );
}

function ShareForm({ canvasId }: { canvasId: Id<"canvases"> }) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"viewer" | "editor">("viewer");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const shareCanvas = useMutation(api.shares.shareCanvas);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsSubmitting(true);
    try {
      await shareCanvas({
        canvasId,
        email: email.trim(),
        permission,
      });
      setEmail("");
    } catch (err) {
      toastError(err, "Failed to share canvas");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="share-email">Email</Label>
        <Input
          id="share-email"
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>
      <div className="flex items-end gap-2">
        <div className="flex flex-col gap-1.5 flex-1">
          <Label>Permission</Label>
          <Select
            value={permission}
            onValueChange={(v) => setPermission(v as "viewer" | "editor")}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="editor">Editor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={isSubmitting || !email.trim()}>
          {isSubmitting ? "Sharing..." : "Share"}
        </Button>
      </div>
    </form>
  );
}

function ShareList({ canvasId }: { canvasId: Id<"canvases"> }) {
  const shares = useQuery(api.shares.listCanvasShares, {
    canvasId,
  });
  const unshareCanvas = useMutation(api.shares.unshareCanvas);

  if (!shares || shares.length === 0) return null;

  const handleRemove = async (shareId: Id<"shares">) => {
    try {
      await unshareCanvas({ shareId });
    } catch (err) {
      toastError(err, "Failed to remove share");
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-2">
      <Label className="text-muted-foreground text-xs">Shared with</Label>
      <div className="flex flex-col divide-y">
        {shares.map((share) => (
          <div
            key={share._id}
            className="flex items-center justify-between py-2"
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium">{share.userName}</span>
              {share.userEmail && (
                <span className="text-xs text-muted-foreground">
                  {share.userEmail}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground capitalize">
                {share.permission}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(share._id)}
                title="Remove access"
              >
                <TbTrash size={14} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
