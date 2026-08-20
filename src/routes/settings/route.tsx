import { useState } from "react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import type { IconType } from "react-icons";
import {
  TbCategory,
  TbChartBar,
  TbFileExport,
  TbKey,
  TbListDetails,
  TbBulb,
  TbMenu2,
  TbUser,
  TbX,
} from "react-icons/tb";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";
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
      { label: "Export my data", icon: TbFileExport, route: "/settings/export" },
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
      { label: "API tokens", icon: TbKey, route: "/settings/api-tokens" },
    ],
  },
];

function RouteComponent() {
  // Sur mobile la sidebar ne tient pas à côté du contenu : elle passe dans une
  // sheet, ouverte depuis la barre du haut et refermée dès qu'on navigue.
  const [navOpen, setNavOpen] = useState(false);

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

  const renderSettingsSidebar = (onNavigate?: () => void) =>
    visibleSections.map((section) => (
      <div key={section.label} className="space-y-1">
        <h3 className="pl-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
          {section.label}
        </h3>
        <div className="flex flex-col gap-0.5">
          {section.buttons.map((button) => {
            const Icon = button.icon;
            return (
              <Link
                key={button.route}
                to={button.route}
                onClick={onNavigate}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200 md:py-1.5"
                activeProps={{
                  className: "bg-gray-200 font-medium text-gray-900",
                }}
              >
                <Icon size={16} className="shrink-0 text-gray-500" />
                {button.label}
              </Link>
            );
          })}
        </div>
      </div>
    ));

  return (
    <div className="flex h-dvh w-full flex-col bg-white md:grid md:grid-cols-[260px_auto]">
      {/* Barre du haut, mobile seulement : le menu et la sortie des settings. */}
      <div
        className="flex shrink-0 items-center gap-2 border-b border-gray-300 px-3 py-2 md:hidden"
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          className="rounded-md bg-gray-100 p-2 hover:bg-gray-200"
          aria-label="Open settings menu"
        >
          <TbMenu2 size={16} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-lg font-bold">Settings</h1>
        <Link
          to="/"
          className="rounded-md bg-gray-100 p-2 hover:bg-gray-200"
          aria-label="Close settings"
        >
          <TbX size={16} />
        </Link>
      </div>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-72 gap-0 p-0">
          <SheetHeader className="border-b border-gray-200">
            <SheetTitle>Settings</SheetTitle>
          </SheetHeader>
          <div className="flex-1 space-y-5 overflow-y-auto p-4">
            {renderSettingsSidebar(() => setNavOpen(false))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Sidebar */}
      <div className="hidden flex-col gap-5 overflow-y-auto border-r border-gray-300 p-5 md:flex">
        <span className="flex items-center gap-2">
          <Link to="/" className="rounded-md bg-gray-100 p-2 hover:bg-gray-200">
            <TbX size={16} />
          </Link>
          <h1 className="text-lg font-bold">Settings</h1>
        </span>
        <div className="space-y-5">{renderSettingsSidebar()}</div>
      </div>

      {/* Core */}
      <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-5">
        <Outlet />
      </div>
    </div>
  );
}
