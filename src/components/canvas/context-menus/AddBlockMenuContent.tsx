import { useEffect, useMemo, useRef, useState } from "react";
import { useConvexAuth } from "convex/react";
import type { Doc } from "@/../convex/_generated/dataModel";
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
import {
  FALLBACK_NODE_HEIGHT,
  FALLBACK_NODE_WIDTH,
} from "@/lib/connectionHandles";
import type {
  ConnectedNodeCreatedInfo,
  PendingCanvasConnection,
} from "@/types/ui/context-menu.types";

export default function AddBlockMenuContent({
  getCreatePosition,
  onCreated,
  showShortcuts = true,
  pendingConnection,
  onConnectionNodeCreated,
}: {
  getCreatePosition: () => { x: number; y: number };
  onCreated?: () => void;
  /** Faux sur les surfaces tactiles : un hint clavier n'y mène nulle part. */
  showShortcuts?: boolean;
  /** Présent quand le menu naît d'un drag lâché dans le vide. */
  pendingConnection?: PendingCanvasConnection | null;
  /** Appelé après la création du node pour chaîner l'edge en attente. */
  onConnectionNodeCreated?: (info: ConnectedNodeCreatedInfo) => void;
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

  const showTemplates = isAuthenticated && SHOW_DEV_ONLY_SETTINGS;

  // Liste unifiée pour la navigation clavier : nodes prébuilt, templates,
  // puis l'entrée « Manage templates » quand elle est affichée.
  type AddMenuItem =
    | { key: string; kind: "node"; config: PrebuiltNodeConfig }
    | { key: string; kind: "template"; template: Doc<"nodeTemplates"> }
    | { key: string; kind: "manage" };

  const items: AddMenuItem[] = [
    ...filteredNodes.map(
      (config): AddMenuItem => ({ key: config.type, kind: "node", config }),
    ),
    ...filteredTemplates.map(
      (template): AddMenuItem => ({
        key: template._id,
        kind: "template",
        template,
      }),
    ),
    ...(showTemplates && !normalizedQuery
      ? [{ key: "__manage__", kind: "manage" as const }]
      : []),
  ];
  const manageIndex = filteredNodes.length + filteredTemplates.length;

  // Index piloté au clavier depuis la recherche (qui garde le focus). Le
  // premier résultat est présélectionné, comme une command palette : Enter
  // l'ouvre directement, Bas/Haut navigue ensuite dans la liste.
  const [activeIndex, setActiveIndex] = useState(0);
  const safeActiveIndex =
    items.length === 0
      ? -1
      : Math.min(Math.max(activeIndex, 0), items.length - 1);

  // Une nouvelle recherche repart du premier résultat.
  useEffect(() => {
    setActiveIndex(0);
  }, [normalizedQuery]);

  // Le conteneur scrolle, pas la page : on ajuste scrollTop à la main plutôt
  // que scrollIntoView (qui remonterait aussi les ancêtres scrollables).
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (safeActiveIndex < 0) return;
    const container = scrollContainerRef.current;
    const el = container?.querySelector<HTMLElement>(
      `[data-add-menu-item="${safeActiveIndex}"]`,
    );
    if (!container || !el) return;
    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.bottom > containerRect.bottom) {
      container.scrollTop += elRect.bottom - containerRect.bottom + 8;
    } else if (elRect.top < containerRect.top) {
      container.scrollTop -= containerRect.top - elRect.top + 8;
    }
  }, [safeActiveIndex]);

  // Remonte le node créé pour chaîner l'edge en attente (drag dans le
  // vide), SANS attendre la confirmation serveur : le `nodeId` est connu
  // dès le retour de `createNode`, donc l'edge visuelle part la même frame
  // que le node. Le menu est déjà fermé à ce stade : `pendingConnection`
  // et `position` sont capturés avant, la fermeture ne les efface pas.
  function chainPendingConnection(
    nodeId: string,
    position: { x: number; y: number },
    width: number,
    height: number,
    nodeSettled: Promise<unknown>,
  ) {
    if (!pendingConnection || !onConnectionNodeCreated) return;
    onConnectionNodeCreated({
      pendingConnection,
      nodeId,
      position,
      width,
      height,
      nodeSettled,
    });
  }

  function handleCreateNode(nodeConfig: PrebuiltNodeConfig) {
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
    const position = getCreatePosition();
    const { nodeId, settled } = createNode({
      node: nodeToCreate,
      position,
      autoEdit: true,
    });
    chainPendingConnection(
      nodeId,
      position,
      nodeToCreate.width ?? FALLBACK_NODE_WIDTH,
      nodeToCreate.height ?? FALLBACK_NODE_HEIGHT,
      settled,
    );
    // Échec éventuel déjà toasté + rollback par le hook : on l'absorbe ici
    // (personne n'attend cette promesse).
    void settled.catch(() => {});
  }

  function handleCreateTemplate(template: Doc<"nodeTemplates">) {
    onCreated?.();
    const position = getCreatePosition();
    const { nodeId, settled } = createNode({
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
      position,
    });
    chainPendingConnection(
      nodeId,
      position,
      template.defaultDimensions.width,
      template.defaultDimensions.height,
      settled,
    );
    void settled.catch(() => {});
  }

  function handleManageTemplates() {
    navigate({
      to: "/settings/templates",
      state: {
        from:
          window.location.pathname +
          window.location.search +
          window.location.hash,
      },
    });
  }

  function handleActivateItem(item: AddMenuItem | undefined) {
    if (!item) return;
    if (item.kind === "node") void handleCreateNode(item.config);
    else if (item.kind === "template") void handleCreateTemplate(item.template);
    else handleManageTemplates();
  }

  // Navigation clavier depuis le champ de recherche (qui garde le focus) :
  // Bas/Droite/Tab = suivant, Haut/Gauche/Shift+Tab = précédent, Home/End =
  // bornes, Enter = créer l'item surligné. Tout est stoppé pour que le
  // typeahead Radix ne se batte pas avec la sélection pilotée ; seul Escape
  // remonte pour laisser Radix fermer le menu.
  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") return;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
      case "ArrowUp":
      case "ArrowLeft":
      case "Home":
      case "End":
      case "Enter":
      case "Tab":
        break;
      default:
        // Garder la frappe pour le filtre : sans ça le typeahead du menu
        // vole les touches.
        e.stopPropagation();
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (items.length === 0) return;
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        setActiveIndex((i) => {
          const cur = Math.min(Math.max(i, 0), items.length - 1);
          return (cur + 1) % items.length;
        });
        break;
      case "ArrowUp":
      case "ArrowLeft":
        setActiveIndex((i) => {
          const cur = Math.min(Math.max(i, 0), items.length - 1);
          return (cur - 1 + items.length) % items.length;
        });
        break;
      case "Tab":
        setActiveIndex((i) => {
          const cur = Math.min(Math.max(i, 0), items.length - 1);
          const delta = e.shiftKey ? -1 : 1;
          return (cur + delta + items.length) % items.length;
        });
        break;
      case "Home":
        setActiveIndex(0);
        break;
      case "End":
        setActiveIndex(items.length - 1);
        break;
      case "Enter":
        handleActivateItem(items[safeActiveIndex]);
        break;
    }
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
            onKeyDown={handleSearchKeyDown}
            onPointerDown={(e) => e.stopPropagation()}
            placeholder="Search a node"
            aria-label="Search a node"
            className="h-9 w-36 rounded-full bg-muted pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring sm:w-48"
          />
        </div>
      </div>
      <DropdownMenuSeparator />

      <div
        ref={scrollContainerRef}
        className="max-h-[min(420px,60vh)] overflow-y-auto p-2"
      >
        {filteredNodes.length > 0 ? (
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {filteredNodes.map((nodeConfig, i) => {
              const Icon = nodeConfig.nodeIcon;
              return (
                <DropdownMenuItem
                  key={nodeConfig.type}
                  data-add-menu-item={i}
                  onSelect={() => {
                    void handleCreateNode(nodeConfig);
                  }}
                  onMouseMove={() => {
                    if (activeIndex !== i) setActiveIndex(i);
                  }}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl px-2.5 py-2.5",
                    "focus:bg-accent data-highlighted:bg-accent",
                    safeActiveIndex === i && "bg-accent",
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
              {filteredTemplates.map((template, i) => {
                const Icon = getTemplateIcon(template.icon);
                const itemIndex = filteredNodes.length + i;
                return (
                  <DropdownMenuItem
                    key={template._id}
                    data-add-menu-item={itemIndex}
                    onSelect={() => {
                      void handleCreateTemplate(template);
                    }}
                    onMouseMove={() => {
                      if (activeIndex !== itemIndex) setActiveIndex(itemIndex);
                    }}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-xl px-2.5 py-2.5 focus:bg-accent data-[highlighted]:bg-accent",
                      safeActiveIndex === itemIndex && "bg-accent",
                    )}
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
            data-add-menu-item={manageIndex}
            onSelect={() => handleManageTemplates()}
            onMouseMove={() => {
              if (activeIndex !== manageIndex) setActiveIndex(manageIndex);
            }}
            className={cn(
              "mt-1 flex cursor-pointer items-center gap-2 rounded-xl px-2.5 py-2 text-sm text-muted-foreground focus:bg-accent data-highlighted:bg-accent",
              safeActiveIndex === manageIndex && "bg-accent",
            )}
          >
            <TbSettings className="size-4" /> Manage templates…
          </DropdownMenuItem>
        )}
      </div>
    </div>
  );
}
