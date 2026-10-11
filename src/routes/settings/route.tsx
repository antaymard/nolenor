import {
  createFileRoute,
  Link,
  Outlet,
  useRouterState,
} from "@tanstack/react-router";
import {
  NAV_ITEM_ACTIVE_CLASS,
  NAV_ITEM_CLASS,
} from "@/components/app-shell/navItemStyles";
import SettingsShell from "@/components/settings/SettingsShell";
import { findSettingsSection } from "@/components/settings/settingsSections";
import { useCloseSettings } from "@/hooks/useCloseSettings";

export const Route = createFileRoute("/settings")({
  component: RouteComponent,
});

/**
 * Les réglages en page : la navigation suit l'URL. Depuis un canvas, les mêmes
 * pages s'ouvrent plutôt en modale par-dessus (cf. `SettingsModal`).
 */
function RouteComponent() {
  // Ferme vers la page d'origine (canvas, home…) plutôt que toujours `/`.
  const closeSettings = useCloseSettings();
  const fullWidth = useRouterState({
    select: (state) => {
      const key = state.location.pathname.replace(/\/$/, "").split("/")[2];
      return findSettingsSection(key)?.fullWidth ?? false;
    },
  });

  return (
    <SettingsShell
      className="h-dvh"
      onClose={closeSettings}
      // Hors canvas : pas de section « Canvas », il n'y a rien à régler.
      hasCanvas={false}
      fullWidth={fullWidth}
      renderNavItem={(section, onNavigate) => {
        const Icon = section.icon;
        return (
          <Link
            to={`/settings/${section.key}`}
            onClick={onNavigate}
            className={NAV_ITEM_CLASS}
            activeProps={{ className: NAV_ITEM_ACTIVE_CLASS }}
          >
            <Icon className="size-[18px] shrink-0" />
            <span className="flex-1">{section.label}</span>
          </Link>
        );
      }}
    >
      <Outlet />
    </SettingsShell>
  );
}
