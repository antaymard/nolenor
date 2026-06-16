import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
} from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import toast from "react-hot-toast";
import { TbX } from "react-icons/tb";

export const Route = createFileRoute("/settings")({
  component: RouteComponent,
});

type SidebarButton = {
  label: string;
  icon: string;
  route?: string;
  action?: "logout";
  variant?: "danger";
};

type SettingsSidebarSection = {
  label: string;
  buttons: SidebarButton[];
};

const settingsSidebarSections: SettingsSidebarSection[] = [
  {
    label: "Customization",
    buttons: [
      {
        label: "Default nodes",
        icon: "settings",
        route: "/settings/",
      },
      {
        label: "Recipes",
        icon: "recipes",
        route: "/settings/recipes",
      },
      {
        label: "Skills",
        icon: "settings",
        route: "/settings/skills",
      },
    ],
  },
  {
    label: "Account",
    buttons: [
      {
        label: "Account information",
        icon: "settings",
        route: "/settings/",
      },
      {
        label: "Sign out",
        icon: "logout",
        action: "logout",
        variant: "danger",
      },
    ],
  },
  {
    label: "Billing",
    buttons: [
      {
        label: "AI usage",
        icon: "usage",
        route: "/settings/ai-usage",
      },
      {
        label: "Subscription",
        icon: "billing",
        route: "/settings/subscription",
      },
    ],
  },
];

function RouteComponent() {
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut();
      toast.success("You have been signed out");
      navigate({ to: "/signin" });
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Error signing out");
    }
  };

  const renderSettingsSidebar = () => {
    return settingsSidebarSections.map((section, index) => (
      <div key={index} className="space-y-1">
        <h3 className="text-sm font-semibold text-gray-500 uppercase pl-2 ">
          {section.label}
        </h3>
        <div className="divide-y divide-gray-300 border border-gray-300 bg-gray-50 rounded-md">
          {section.buttons.map((button, btnIndex) => {
            // If it's an action button (like logout)
            if (button.action === "logout") {
              return (
                <button
                  key={btnIndex}
                  type="button"
                  onClick={handleLogout}
                  className="flex items-center p-2 first:rounded-t-md last:rounded-b-md text-red-600 hover:bg-red-50 w-full text-left transition-colors"
                >
                  {button.label}
                </button>
              );
            }

            // Regular link button
            return (
              <Link
                key={button.route}
                to={button.route!}
                className="flex items-center p-2 first:rounded-t-md last:rounded-b-md text-gray-700 hover:bg-gray-200"
              >
                {button.label}
              </Link>
            );
          })}
        </div>
      </div>
    ));
  };

  return (
    <div className="h-screen w-screen bg-white grid grid-cols-[300px_auto]">
      {/* Sidebar */}
      <div className="flex flex-col gap-4 p-5 border-r border-gray-300">
        <span className="flex items-center gap-2">
          <Link to="/" className="p-2 rounded-md bg-gray-100 hover:bg-gray-200">
            <TbX size={16} />
          </Link>
          <h1 className="text-lg font-bold">Settings</h1>
        </span>
        <div className="space-y-5">{renderSettingsSidebar()}</div>
      </div>

      {/* Core */}
      <div className="p-5">
        <Outlet />
      </div>
    </div>
  );
}
