import { useState } from "react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import type { IconType } from "react-icons";
import {
  TbArrowLeft,
  TbBrain,
  TbCategory,
  TbChartBar,
  TbFileExport,
  TbKey,
  TbListDetails,
  TbBulb,
  TbMenu2,
  TbPalette,
  TbUser,
  TbX,
} from "react-icons/tb";
import {
  NAV_ITEM_ACTIVE_CLASS,
  NAV_ITEM_CLASS,
} from "@/components/app-shell/navItemStyles";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";
import { useCloseSettings } from "@/hooks/useCloseSettings";
import { SHOW_DEV_ONLY_SETTINGS } from "@/lib/featureFlags";

export const Route = createFileRoute("/settings")({
  component: RouteComponent,
});

type SidebarButton = {
  label: string;
  icon: IconType;
  route: string;
  /** Entrée réservée au dev, cf. lib/featureFlags.ts. */
  devOnly?: boolean;
};

type SettingsSidebarSection = {
  label: string;
  buttons: SidebarButton[];
};

// Trois groupes, et rien d'autre : ce qu'on est (Account), ce qu'on fabrique
// pour le canvas (Customization), ce qu'on branche dessus (Developer).
// « Sign out » a quitté la liste — c'est une action, pas une page, et elle
// vit maintenant sur la page Account. Les entrées mortes ont disparu avec :
// « Default nodes » et « Account information » pointaient sur /settings, qui
// n'a jamais eu de page, et « Subscription » sur une route inexistante.
const settingsSidebarSections: SettingsSidebarSection[] = [
  {
    label: "Account",
    buttons: [
      { label: "Account", icon: TbUser, route: "/settings/account" },
      { label: "AI usage", icon: TbChartBar, route: "/settings/ai-usage" },
      {
        label: "Export my data",
        icon: TbFileExport,
        route: "/settings/export",
      },
    ],
  },
  {
    label: "Customization",
    buttons: [
      {
        label: "Custom nodes",
        icon: TbCategory,
        route: "/settings/templates",
        devOnly: true,
      },
      { label: "Skills", icon: TbBulb, route: "/settings/skills" },
      { label: "Canvas", icon: TbPalette, route: "/settings/canvas" },
      { label: "Agent Memory", icon: TbBrain, route: "/settings/memories" },
      {
        label: "Recipes",
        icon: TbListDetails,
        route: "/settings/recipes",
        devOnly: true,
      },
    ],
  },
  {
    label: "Developer",
    buttons: [
      { label: "MCP & API tokens", icon: TbKey, route: "/settings/api-tokens" },
    ],
  },
];

function RouteComponent() {
  // Sur mobile la sidebar ne tient pas à côté du contenu : elle passe dans une
  // sheet, ouverte depuis la barre du haut et refermée dès qu'on navigue.
  const [navOpen, setNavOpen] = useState(false);
  // Ferme vers la page d'origine (canvas, home…) plutôt que toujours `/`.
  const closeSettings = useCloseSettings();

  // Une section dont toutes les entrées sont réservées au dev disparaît avec
  // elles, plutôt que de laisser un titre seul en production.
  const visibleSections = settingsSidebarSections
    .map((section) => ({
      ...section,
      buttons: section.buttons.filter(
        (button) => !button.devOnly || SHOW_DEV_ONLY_SETTINGS,
      ),
    }))
    .filter((section) => section.buttons.length > 0);

  const renderSettingsSidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col gap-5 px-3 pt-4 pb-3">
      <div className="flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={closeSettings}
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-700"
          aria-label="Close settings"
        >
          <TbArrowLeft className="size-[18px]" />
        </button>
        <span className="text-[17px] font-bold tracking-tight text-slate-900">
          Settings
        </span>
      </div>

      <nav
        aria-label="Settings"
        className="-mx-3 flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-3"
      >
        {visibleSections.map((section) => (
          <div key={section.label} className="flex flex-col gap-0.5">
            <h2 className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              {section.label}
            </h2>
            {section.buttons.map((button) => {
              const Icon = button.icon;
              return (
                <Link
                  key={button.route}
                  to={button.route}
                  onClick={onNavigate}
                  className={NAV_ITEM_CLASS}
                  activeProps={{ className: NAV_ITEM_ACTIVE_CLASS }}
                >
                  <Icon className="size-[18px] shrink-0" />
                  <span className="flex-1">{button.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </div>
  );

  // Le même shell que la home (cf. routes/_app.tsx) : sidebar grise à gauche,
  // page blanche à droite, barre du haut sur mobile.
  return (
    <div className="flex h-dvh w-full bg-white">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-50 md:block">
        {renderSettingsSidebar()}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre du haut, mobile seulement : le menu et la sortie des settings. */}
        <div
          className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2 md:hidden"
          style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Open settings menu"
          >
            <TbMenu2 size={18} />
          </button>
          <span className="min-w-0 flex-1 truncate font-extrabold tracking-tight text-slate-900">
            Settings
          </span>
          <button
            type="button"
            onClick={closeSettings}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Close settings"
          >
            <TbX size={18} />
          </button>
        </div>

        {/* La page scrolle ici, à l'intérieur du shell à hauteur fixe. Les
            pages en deux colonnes (Skills) prennent `h-full` pour faire
            défiler leurs listes elles-mêmes. */}
        <main className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain px-4 py-8 md:px-10 md:py-10">
          <div className="mx-auto h-full max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-72 gap-0 bg-slate-50 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Settings</SheetTitle>
          </SheetHeader>
          {renderSettingsSidebar(() => setNavOpen(false))}
        </SheetContent>
      </Sheet>
    </div>
  );
}
