import { useMemo, useState } from "react";
import { useConvexAuth } from "convex/react";
import { useNavigate } from "@tanstack/react-router";
import { TbSearch, TbSettings } from "react-icons/tb";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/shadcn/dropdown-menu";
import { Kbd } from "@/components/shadcn/kbd";
import { useCreateNode } from "@/hooks/useCreateNode";
import prebuiltNodesConfig, {
  canNodeTypeBeCreated,
  type PrebuiltNodeConfig,
} from "../../nodes/prebuilt-nodes/prebuiltNodesConfig";
import { useMyTemplates } from "@/stores/templatesStore";
import { getTemplateIcon } from "@/components/fields/registry/templateIcons";
import { SHOW_DEV_ONLY_SETTINGS } from "@/lib/featureFlags";
import { cn } from "@/lib/utils";

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
  const [query, setQuery] = useState("");
  // Autofocus seulement au pointeur fin : sur tactile, focus = clavier
  // virtuel qui recouvre le menu. Évalué au montage (le menu est démonté
  // à chaque fermeture, donc la valeur est fraîche à chaque ouverture).
  const [shouldAutofocus] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(pointer: fine)").matches === true,
  );

  // Lu depuis templatesStore, alimenté par la subscription listMine de la
  // route canvas : disponible dès le premier rendu. Une useQuery locale
  // rouvrait une subscription à chaque ouverture du menu (ce composant est
  // démonté à la fermeture), donc rendait d'abord une liste vide — et le
  // wrapper mesure puis fige la position du menu à ce moment-là.
  const templates = useMyTemplates();

  const creatableNodes = useMemo(
    () =>
      prebuiltNodesConfig.filter((nodeConfig) =>
        canNodeTypeBeCreated(nodeConfig.node.type),
      ),
    [],
  );

  const normalizedQuery = query.trim().toLowerCase();
  const filteredNodes = normalizedQuery
    ? creatableNodes.filter(
        (nodeConfig) =>
          nodeConfig.label.toLowerCase().includes(normalizedQuery) ||
          nodeConfig.description.toLowerCase().includes(normalizedQuery),
      )
    : creatableNodes;

  const filteredTemplates = normalizedQuery
    ? templates.filter((template) =>
        template.name.toLowerCase().includes(normalizedQuery),
      )
    : templates;

  const showTemplates =
    isAuthenticated && SHOW_DEV_ONLY_SETTINGS;

  async function handleCreateNode(nodeConfig: PrebuiltNodeConfig) {
    const nodeToCreate = { ...nodeConfig.node };
    if (nodeConfig.variants?.default) {
      nodeToCreate.height = nodeConfig.variants.default.defaultHeight;
      nodeToCreate.width = nodeConfig.variants.default.defaultWidth;
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
  }

  return (
    <div className="w-[min(560px,calc(100vw-32px))]">
      {/* En-tête façon inspo : titre à gauche, recherche en pilule à droite. */}
      <div className="flex items-center justify-between gap-3 px-3 pt-2.5 pb-2">
        <span className="text-[15px] font-semibold text-foreground whitespace-nowrap">
          Add a node
        </span>
        <div className="relative shrink-0">
          <TbSearch className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            autoFocus={shouldAutofocus}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Laisser Escape remonter (Radix ferme le menu), mais garder
              // la frappe pour le filtre : sans ça le typeahead du menu
              // vole les touches et Enter active l'item surligné.
              if (e.key === "Enter" && filteredNodes.length > 0) {
                e.preventDefault();
                void handleCreateNode(filteredNodes[0]);
                return;
              }
              if (e.key !== "Escape") e.stopPropagation();
            }}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Search a node"
            aria-label="Search a node"
            className="h-9 w-36 rounded-full bg-muted pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring sm:w-48"
          />
        </div>
      </div>
      <DropdownMenuSeparator />

      <div className="max-h-[min(420px,60vh)] overflow-y-auto p-2">
        {filteredNodes.length > 0 ? (
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {filteredNodes.map((nodeConfig) => {
              const Icon = nodeConfig.nodeIcon;
              return (
                <DropdownMenuItem
                  key={nodeConfig.type}
                  onSelect={() => {
                    void handleCreateNode(nodeConfig);
                  }}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl px-2.5 py-2.5",
                    "focus:bg-accent data-[highlighted]:bg-accent",
                  )}
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand [&_svg]:size-5">
                    <Icon />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-foreground">
                        {nodeConfig.label}
                      </span>
                      {showShortcuts && nodeConfig.creationShortcut && (
                        <Kbd className="ml-auto shrink-0">
                          {nodeConfig.creationShortcut}
                        </Kbd>
                      )}
                    </span>
                    <span className="line-clamp-2 text-xs leading-snug font-normal text-muted-foreground">
                      {nodeConfig.description}
                    </span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </div>
        ) : null}

        {/* Custom nodes réservés au dev (cf. lib/featureFlags.ts) : c'est la
            seule surface de CRÉATION d'un node custom, donc la seule à masquer.
            Les custom nodes déjà posés sur un canvas continuent de s'afficher et
            de s'éditer normalement. */}
        {showTemplates && filteredTemplates.length > 0 && (
          <>
            <p className="px-2.5 pt-3 pb-1 text-xs font-medium text-muted-foreground">
              My templates
            </p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {filteredTemplates.map((template) => {
                const Icon = getTemplateIcon(template.icon);
                return (
                  <DropdownMenuItem
                    key={template._id}
                    onSelect={() => {
                      onCreated?.();
                      void createNode({
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
                    className="flex cursor-pointer items-start gap-3 rounded-xl px-2.5 py-2.5 focus:bg-accent data-[highlighted]:bg-accent"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand [&_svg]:size-5">
                      <Icon />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-sm font-medium text-foreground">
                        {template.name}
                      </span>
                      <span className="line-clamp-2 text-xs leading-snug font-normal text-muted-foreground">
                        Reusable custom node
                      </span>
                    </span>
                  </DropdownMenuItem>
                );
              })}
            </div>
          </>
        )}

        {filteredNodes.length === 0 && filteredTemplates.length === 0 && (
          <p className="px-2 py-8 text-center text-sm text-muted-foreground">
            No node matches “{query.trim()}”
          </p>
        )}

        {showTemplates && !normalizedQuery && (
          <DropdownMenuItem
            onSelect={() =>
              navigate({
                to: "/settings/templates",
                state: {
                  from:
                    window.location.pathname +
                    window.location.search +
                    window.location.hash,
                },
              })
            }
            className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-muted-foreground focus:bg-accent data-[highlighted]:bg-accent"
          >
            <TbSettings className="size-4" /> Manage templates…
          </DropdownMenuItem>
        )}
      </div>
    </div>
  );
}
