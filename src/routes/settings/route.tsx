import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import type { IconType } from "react-icons";
import {
  TbCategory,
  TbChartBar,
  TbFileExport,
  TbKey,
  TbListDetails,
  TbBulb,
  TbUser,
  TbX,
} from "react-icons/tb";

export const Route = createFileRoute("/settings")({
  component: RouteComponent,
});

type SidebarButton = {
  label: string;
  icon: IconType;
  route: string;
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
      { label: "Custom nodes", icon: TbCategory, route: "/settings/templates" },
      { label: "Skills", icon: TbBulb, route: "/settings/skills" },
      { label: "Recipes", icon: TbListDetails, route: "/settings/recipes" },
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
  const renderSettingsSidebar = () =>
    settingsSidebarSections.map((section) => (
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
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-200"
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
    <div className="grid h-screen w-screen grid-cols-[260px_auto] bg-white">
      {/* Sidebar */}
      <div className="flex flex-col gap-5 overflow-y-auto border-r border-gray-300 p-5">
        <span className="flex items-center gap-2">
          <Link to="/" className="rounded-md bg-gray-100 p-2 hover:bg-gray-200">
            <TbX size={16} />
          </Link>
          <h1 className="text-lg font-bold">Settings</h1>
        </span>
        <div className="space-y-5">{renderSettingsSidebar()}</div>
      </div>

      {/* Core */}
      <div className="min-h-0 overflow-y-auto p-5">
        <Outlet />
      </div>
    </div>
  );
}
