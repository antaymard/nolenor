import { useConvexAuth, useQuery } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { TbSettings } from "react-icons/tb";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/shadcn/dropdown-menu";
import { useCreateNode } from "@/hooks/useCreateNode";
import prebuiltNodesConfig from "../../nodes/prebuilt-nodes/prebuiltNodesConfig";
import { api } from "@/../convex/_generated/api";
import { getTemplateIcon } from "@/components/fields/registry/templateIcons";

export default function AddBlockMenuContent({
  getCreatePosition,
  onCreated,
}: {
  getCreatePosition: () => { x: number; y: number };
  onCreated?: () => void;
}) {
  const { createNode } = useCreateNode();
  const navigate = useNavigate();
  const { isAuthenticated } = useConvexAuth();

  // Templates non archivés du user (section « My templates »).
  const templates = useQuery(
    api.nodeTemplates.listMine,
    isAuthenticated ? {} : "skip",
  );

  return (
    <>
      <DropdownMenuLabel className="whitespace-nowrap">
        Add a block
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {prebuiltNodesConfig.map((nodeConfig, i) => {
        const Icon = nodeConfig.nodeIcon;
        return (
          <DropdownMenuItem
            key={i}
            className="w-48"
            onClick={async () => {
              const nodeToCreate = { ...nodeConfig.node };
              if (nodeConfig.variants?.default) {
                nodeToCreate.height = nodeConfig.variants.default.defaultHeight;
                nodeToCreate.width = nodeConfig.variants.default.defaultWidth;
              }

              await createNode({
                node: nodeToCreate,
                position: getCreatePosition(),
              });
              onCreated?.();
            }}
          >
            <Icon /> {nodeConfig.label}
          </DropdownMenuItem>
        );
      })}

      {isAuthenticated && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="whitespace-nowrap">
            My templates
          </DropdownMenuLabel>
          {templates?.map((template) => {
            const Icon = getTemplateIcon(template.icon);
            return (
              <DropdownMenuItem
                key={template._id}
                className="w-48"
                onClick={async () => {
                  await createNode({
                    node: {
                      id: "",
                      type: "custom",
                      width: template.defaultDimensions.width,
                      height: template.defaultDimensions.height,
                      position: { x: 0, y: 0 },
                      data: {
                        color: template.color ?? "default",
                        templateId: template._id,
                      },
                    },
                    position: getCreatePosition(),
                  });
                  onCreated?.();
                }}
              >
                <Icon /> {template.name}
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuItem
            className="w-48 text-muted-foreground"
            onClick={() => navigate({ to: "/settings/templates" })}
          >
            <TbSettings /> Manage templates…
          </DropdownMenuItem>
        </>
      )}
    </>
  );
}
