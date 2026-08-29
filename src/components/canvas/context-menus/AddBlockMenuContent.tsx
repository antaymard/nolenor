import { useConvexAuth } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { TbSettings } from "react-icons/tb";
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/shadcn/dropdown-menu";
import { Kbd } from "@/components/shadcn/kbd";
import { useCreateNode } from "@/hooks/useCreateNode";
import prebuiltNodesConfig, {
  canNodeTypeBeCreated,
} from "../../nodes/prebuilt-nodes/prebuiltNodesConfig";
import { useMyTemplates } from "@/stores/templatesStore";
import { getTemplateIcon } from "@/components/fields/registry/templateIcons";
import { SHOW_DEV_ONLY_SETTINGS } from "@/lib/featureFlags";

export default function AddBlockMenuContent({
  getCreatePosition,
  onCreated,
  showShortcuts = true,
}: {
  getCreatePosition: () => { x: number; y: number };
  onCreated?: () => void;
  /** Faux sur les surfaces tactiles : un hint clavier n'y mène nulle part. */
  showShortcuts?: boolean;
}) {
  const { createNode } = useCreateNode();
  const navigate = useNavigate();
  const { isAuthenticated } = useConvexAuth();

  // Lu depuis templatesStore, alimenté par la subscription listMine de la
  // route canvas : disponible dès le premier rendu. Une useQuery locale
  // rouvrait une subscription à chaque ouverture du menu (ce composant est
  // démonté à la fermeture), donc rendait d'abord une liste vide — et le
  // wrapper mesure puis fige la position du menu à ce moment-là.
  const templates = useMyTemplates();

  return (
    <>
      <DropdownMenuLabel className="whitespace-nowrap">
        Add a block
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      {prebuiltNodesConfig
        .filter((nodeConfig) => canNodeTypeBeCreated(nodeConfig.node.type))
        .map((nodeConfig, i) => {
          const Icon = nodeConfig.nodeIcon;
          return (
            <DropdownMenuItem
              key={i}
              className="w-48"
              onClick={async () => {
                const nodeToCreate = { ...nodeConfig.node };
                if (nodeConfig.variants?.default) {
                  nodeToCreate.height =
                    nodeConfig.variants.default.defaultHeight;
                  nodeToCreate.width =
                    nodeConfig.variants.default.defaultWidth;
                }

                // Fermer AVANT de créer : Radix rend le focus à son trigger
                // en se fermant, ce qui volerait le curseur au titre qui
                // s'ouvre en édition (cf. `autoEdit`). La fermeture part donc
                // tout de suite, la création la suit — et le menu ne reste
                // plus ouvert le temps de l'aller-retour Convex.
                onCreated?.();
                await createNode({
                  node: nodeToCreate,
                  position: getCreatePosition(),
                  autoEdit: true,
                });
              }}
            >
              <Icon /> {nodeConfig.label}
              {showShortcuts && nodeConfig.creationShortcut && (
                <Kbd className="ml-auto">{nodeConfig.creationShortcut}</Kbd>
              )}
            </DropdownMenuItem>
          );
        })}

      {/* Custom nodes réservés au dev (cf. lib/featureFlags.ts) : c'est la
          seule surface de CRÉATION d'un node custom, donc la seule à masquer.
          Les custom nodes déjà posés sur un canvas continuent de s'afficher et
          de s'éditer normalement. */}
      {isAuthenticated && SHOW_DEV_ONLY_SETTINGS && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="whitespace-nowrap">
            My templates
          </DropdownMenuLabel>
          {templates.map((template) => {
            const Icon = getTemplateIcon(template.icon);
            return (
              <DropdownMenuItem
                key={template._id}
                className="w-48"
                onClick={async () => {
                  onCreated?.();
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
