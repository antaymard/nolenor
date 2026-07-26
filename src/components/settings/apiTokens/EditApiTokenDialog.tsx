import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import toast from "react-hot-toast";

type ApiTokenPermission = "read" | "write";

type EditableToken = {
  _id: Id<"apiTokens">;
  name: string;
  permission: ApiTokenPermission;
};

export default function EditApiTokenDialog({
  token,
  onOpenChange,
}: {
  token: EditableToken | null;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [permission, setPermission] = useState<ApiTokenPermission>("read");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateApiToken = useMutation(api.apiTokens.update);

  useEffect(() => {
    if (token) {
      setName(token.name);
      setPermission(token.permission);
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !name.trim()) return;

    setIsSubmitting(true);
    try {
      await updateApiToken({
        tokenId: token._id,
        name: name.trim(),
        permission,
      });
      toast.success("Token updated");
      onOpenChange(false);
    } catch (err) {
      toastError(err, "Failed to update token");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={!!token} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit token</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="edit-token-name">Name</Label>
            <Input
              id="edit-token-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Permission</Label>
            <Select
              value={permission}
              onValueChange={(v) => setPermission(v as ApiTokenPermission)}
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
              {isSubmitting ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
