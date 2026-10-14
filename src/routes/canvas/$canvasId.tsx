import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ReactFlowProvider, Panel } from "@xyflow/react";
import type { Id } from "@/../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import SettingsModal from "@/components/settings/SettingsModal";
import CanvasErrorScreen from "@/components/canvas/CanvasErrorScreen";
import { lazy, Suspense } from "react";
import WindowsContainer from "@/components/windows/WindowsContainer";
import { useIsMobile } from "@/hooks/use-mobile";
import CanvasSidebar from "@/components/canvas/CanvasSidebar";
import CanvasFlow from "@/components/canvas/CanvasFlow";
import { useCanvasBootstrap } from "@/hooks/useCanvasBootstrap";
import { Spinner } from "@/components/shadcn/spinner";
import NoleCanvasPanel from "@/components/canvas/NoleCanvasPanel";
import Omnibar from "@/components/canvas/omnibar/Omnibar";
import CanvasDock from "@/components/canvas/on-canvas-ui/canvas-dock/CanvasDock";
import MinimizedDock from "@/components/canvas/on-canvas-ui/canvas-dock/MinimizedDock";
import CanvasToolbar from "@/components/canvas/on-canvas-ui/CanvasToolbar";
import TopRightToolbar from "@/components/canvas/on-canvas-ui/TopRightToolbar";
import AuthUpgradeBanner from "@/components/canvas/on-canvas-ui/AuthUpgradeBanner";
import { useConvexAuth } from "convex/react";
import SearchModale from "@/components/canvas/search-modale/SearchModale";
import CanvasWelcomeModal from "@/components/canvas/welcome/CanvasWelcomeModal";
import { useOpenThreadFromUrl } from "@/hooks/useOpenThreadFromUrl";
import { useEmptyCanvasOnboarding } from "@/hooks/useEmptyCanvasOnboarding";
import EmptyCanvasWithNole from "@/components/canvas/onboarding/EmptyCanvasWithNole";
import LoadingScreen from "@/components/loading/LoadingScreen";
import DockSlideIn from "@/components/canvas/loading/DockSlideIn";
import { useCanvasLoadingSession } from "@/hooks/useCanvasLoadingSession";
// Mobile-only surface: don't ship it to desktop sessions.
const MobileCanvas = lazy(() => import("@/components/mobile/MobileCanvas"));

// `?v=cx,cy,zoom` : le cadrage sur lequel ouvrir le canvas, porté par un lien
// partagé (cf. `useInitialViewportFromUrl` et le bouton de `SharingModal`).
//
// Déclaré ici et non sur la racine comme `?template=` : un cadrage n'a de sens
// que dans un canvas donné, donc changer de canvas doit le laisser tomber.
// `.catch(undefined)` comme les autres params qui viennent de l'extérieur
// (cf. `signin.tsx`) : une URL abîmée ne doit pas casser la route. Le triple
// n'est pas décodé ici — le parse tolérant vit dans `canvasViewportFraming`.
//
// `?thread=<threadId>` : la conversation Nolë à ouvrir en arrivant, posée par le
// bouton « Open » d'une tâche sur la home (cf. `useOpenThreadFromUrl`, qui la
// retire de l'URL une fois consommée).
//
// `?onboarding=true` : le canvas est vide (ni nodes ni edges) et l'onboarding
// prend le relais — `EmptyCanvasWithNole` au lieu du canvas React Flow vide
// (cf. `useEmptyCanvasOnboarding`). L'union booléen/chaîne couvre les deux
// formes que TanStack peut fournir : `true` parsé, ou `"true"` brut d'une URL
// construite à la main.
const canvasSearchSchema = z.object({
  v: z.string().optional().catch(undefined),
  thread: z.string().optional().catch(undefined),
  onboarding: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .optional()
    .catch(undefined),
});

export const Route = createFileRoute("/canvas/$canvasId")({
  component: RouteComponent,
  validateSearch: canvasSearchSchema,
});

function RouteComponent() {
  const { canvasId } = Route.useParams() as { canvasId: Id<"canvases"> };
  const { isAuthenticated } = useConvexAuth();
  const isMobile = useIsMobile();

  // Les réglages s'ouvrent en modale par-dessus le canvas, qui reste monté.
  const settingsModal = isAuthenticated ? (
    <SettingsModal canvasId={canvasId} />
  ) : null;

  if (isMobile && isAuthenticated) {
    return (
      <div className="bg-surface">
        {settingsModal}
        <Suspense
          fallback={
            <div className="flex h-screen items-center justify-center">
              <Spinner className="size-6 text-muted-foreground" />
            </div>
          }
        >
          <MobileCanvas canvasId={canvasId} />
        </Suspense>
      </div>
    );
  }

  const canvasContent = (
    // `overscroll-none` : le pan trackpad horizontal ne doit jamais
    // déborder en geste "back" navigateur (cf. index.css).
    <div className={cn("h-screen w-full overflow-hidden overscroll-none")}>
      <CanvasContent canvasId={canvasId} isAuthenticated={isAuthenticated} />
    </div>
  );

  return (
    <div className="bg-surface">
      {settingsModal}
      <ReactFlowProvider key={canvasId}>
        {isAuthenticated ? (
          <CanvasSidebar canvasId={canvasId}>{canvasContent}</CanvasSidebar>
        ) : (
          canvasContent
        )}
      </ReactFlowProvider>
    </div>
  );
}

function CanvasContent({
  canvasId,
  isAuthenticated,
}: {
  canvasId: Id<"canvases">;
  isAuthenticated: boolean;
}) {
  const {
    canvas,
    flowNodes,
    flowEdges,
    isContentReady,
    loadProgress,
    isCanvasError,
    canvasError,
    isNodeDatasError,
    nodeDatasError,
  } = useCanvasBootstrap(canvasId, { isAuthenticated });

  // Avant tout retour anticipé : l'écran de chargement de l'app passe la main
  // à celui du canvas dès ce montage, écran d'erreur compris.
  useCanvasLoadingSession(loadProgress);

  // Après `useCanvasBootstrap`, dont le nettoyage remet la conversation active
  // à zéro : ses effets passent avant ceux de ce hook.
  useOpenThreadFromUrl({ ready: Boolean(canvas) && isAuthenticated });

  // Onboarding canvas vide : vide avéré + `?onboarding=true` → on rend
  // `EmptyCanvasWithNole` au lieu du canvas. Le hook pose/retire le param
  // tout seul (arrivée sur un canvas vide / premier node créé par Nolë).
  const { showOnboarding, isRedirectPending } = useEmptyCanvasOnboarding({
    flowNodes,
    flowEdges,
    canAutoEnter:
      isAuthenticated &&
      Boolean(canvas) &&
      canvas?._permission !== "viewer",
  });

  // L'UI arrive au fil du chargement, par-dessus son écran : les coins du
  // haut avec le doc canvas, les docks du bas avec la structure (nodes et
  // edges), le contenu en dernier.
  const areDocksRevealed =
    isContentReady || (flowNodes !== undefined && flowEdges !== undefined);

  if (isCanvasError && canvasError) {
    return (
      <CanvasErrorScreen
        error={canvasError}
        isAuthenticated={isAuthenticated}
      />
    );
  }

  if (isNodeDatasError && nodeDatasError) {
    return (
      <CanvasErrorScreen
        error={nodeDatasError}
        isAuthenticated={isAuthenticated}
        title="This canvas could not be loaded"
      />
    );
  }

  if (!canvas) {
    return <StandaloneLoadingScreen />;
  }

  // Canvas vide en cours de bascule vers `?onboarding=true` : ne pas peindre
  // un React Flow vide une frame — le param arrive par `replace` juste après.
  if (isRedirectPending) {
    return <StandaloneLoadingScreen />;
  }

  // Onboarding : pas de canvas, pas de toolbars — juste Nolë. Reste sous le
  // `ReactFlowProvider` de la route (requis par `ChatContainer` via
  // `useNoleChat` → `useReactFlow`).
  if (showOnboarding) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden overscroll-none">
        <EmptyCanvasWithNole canvasId={canvasId} canvasName={canvas.name} />
      </div>
    );
  }

  return (
    <div className="flex-1 w-full h-full overflow-hidden overscroll-none">
      {/* Une fois le contenu chargé : on accueille sur un canvas affiché, pas
          sur un écran de chargement. */}
      {isContentReady ? <CanvasWelcomeModal /> : null}
      <SearchModale />
      <WindowsContainer />
      <CanvasFlow
        canvasId={canvasId}
        canvasNodes={flowNodes}
        canvasEdges={flowEdges}
        background={canvas.background}
        canEdit={canvas._permission !== "viewer"}
        variant="desktop"
      >
        {/* Au-dessus du renderer de React Flow (z 4, peint avant les
            `children`), sous ses `<Panel>` (z 5) : l'écran cache le contenu
            jusqu'à ce qu'il soit chargé, l'UI du haut apparaît par-dessus dès
            que le doc canvas est là. Les docks du bas attendent la fin. */}
        <LoadingScreen visible={!isContentReady} className="z-[4]" />
        {isAuthenticated ? (
          <Panel position="top-right">
            <TopRightToolbar />
          </Panel>
        ) : null}
        <Panel position="bottom-center">
          <DockSlideIn
            revealed={areDocksRevealed}
            delay={DOCK_DELAYS_MS.center}
          >
            <CanvasToolbar
              canvasId={canvasId}
              canRecordVoiceMemo={
                isAuthenticated && canvas._permission !== "viewer"
              }
            />
          </DockSlideIn>
        </Panel>
        {isAuthenticated ? (
          <>
            <Panel position="bottom-left">
              {/* L'omnibar (demander sans choisir de conversation, et les
                  tâches de Nolë empilées au-dessus) tient le coin. La
                  conversation étendue est un `absolute` ancré dans
                  `NoleCanvasPanel` : elle flotte au-dessus de l'island. */}
              <DockSlideIn
                revealed={areDocksRevealed}
                delay={DOCK_DELAYS_MS.left}
              >
                <NoleCanvasPanel>
                  <Omnibar canvasId={canvasId} />
                </NoleCanvasPanel>
              </DockSlideIn>
            </Panel>
            {/* Le miroir du coin gauche : le bouton des repères reste à
                l'extrême droite, les windows minimisées le prolongent vers le
                centre. */}
            <Panel position="bottom-right">
              <DockSlideIn
                revealed={areDocksRevealed}
                delay={DOCK_DELAYS_MS.right}
              >
                <div className="flex items-center gap-2">
                  <MinimizedDock />
                  <CanvasDock />
                </div>
              </DockSlideIn>
            </Panel>
          </>
        ) : (
          <Panel position="top-center">
            <AuthUpgradeBanner />
          </Panel>
        )}
      </CanvasFlow>
    </div>
  );
}

/** Les docks du bas montent de gauche à droite. */
const DOCK_DELAYS_MS = { left: 80, center: 140, right: 200 } as const;

/**
 * L'écran de chargement avant le React Flow (doc canvas pas encore là, ou
 * bascule vers l'onboarding). Même écran que celui du React Flow, qui le
 * remplace sans que rien ne bouge.
 */
function StandaloneLoadingScreen() {
  return (
    <div className="relative h-full w-full">
      <LoadingScreen visible />
    </div>
  );
}
