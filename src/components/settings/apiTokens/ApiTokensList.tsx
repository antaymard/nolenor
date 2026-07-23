import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { Button } from "@/components/shadcn/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/shadcn/table";
import { toastError } from "@/components/utils/errorUtils";
import { TbPencil, TbTrash } from "react-icons/tb";
import EditApiTokenDialog from "./EditApiTokenDialog";

type ApiTokenPermission = "read" | "write";

type ApiToken = {
  _id: Id<"apiTokens">;
  name: string;
  permission: ApiTokenPermission;
  tokenPrefix: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
};

export default function ApiTokensList({ tokens }: { tokens: ApiToken[] }) {
  const [editingToken, setEditingToken] = useState<ApiToken | null>(null);
  const revokeApiToken = useMutation(api.apiTokens.revoke);

  const handleRevoke = async (token: ApiToken) => {
    const confirmed = confirm(
      `Revoke token "${token.name}"? Any application using it will immediately lose access.`,
    );
    if (!confirmed) return;

    try {
      await revokeApiToken({ tokenId: token._id });
    } catch (err) {
      toastError(err, "Failed to revoke token");
    }
  };

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Token</TableHead>
            <TableHead>Permission</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last used</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="bg-white">
          {tokens.map((token) => {
            const isRevoked = token.revokedAt !== undefined;
            return (
              <TableRow
                key={token._id}
                className={isRevoked ? "opacity-50" : undefined}
              >
                <TableCell>{token.name}</TableCell>
                <TableCell className="font-mono text-xs">
                  {token.tokenPrefix}…
                </TableCell>
                <TableCell className="capitalize">
                  {token.permission}
                </TableCell>
                <TableCell>
                  {new Date(token.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  {token.lastUsedAt
                    ? new Date(token.lastUsedAt).toLocaleDateString()
                    : "Never"}
                </TableCell>
                <TableCell>
                  {isRevoked ? (
                    <span className="text-xs text-muted-foreground">
                      Revoked {new Date(token.revokedAt!).toLocaleDateString()}
                    </span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Edit token"
                        onClick={() => setEditingToken(token)}
                      >
                        <TbPencil size={14} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title="Revoke token"
                        onClick={() => handleRevoke(token)}
                      >
                        <TbTrash size={14} />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <EditApiTokenDialog
        token={editingToken}
        onOpenChange={(open) => !open && setEditingToken(null)}
      />
    </>
  );
}
