import type { ReactNode } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useAuthActions } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import toast from "react-hot-toast";
import type { IconType } from "react-icons";
import {
  TbChevronDown,
  TbHome,
  TbInbox,
  TbLogout,
  TbPlayerPlay,
  TbSearch,
  TbSettings,
} from "react-icons/tb";
import { api } from "@/../convex/_generated/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/shadcn/dropdown-menu";
import { Kbd, KbdGroup } from "@/components/shadcn/kbd";
import { useAiUsage } from "@/hooks/useAiUsage";
import { useHomePendingTasks } from "@/hooks/useHomePendingTasks";
import { useTaskCanvases } from "@/hooks/useTaskCanvases";
import { formatCostCompact } from "@/lib/formatUsage";
import { cn } from "@/lib/utils";
import { useCommandCenterStore } from "@/stores/commandCenterStore";
import NewCanvasButton from "./NewCanvasButton";

type NavItem = {
  label: string;
  icon: IconType;
  to: "/" | "/inbox" | "/tutorials";
};

const NAV_ITEMS: NavItem[] = [
  { label: "Home", icon: TbHome, to: "/" },
  { label: "Inbox", icon: TbInbox, to: "/inbox" },
  { label: "Tutorials", icon: TbPlayerPlay, to: "/tutorials" },
];

/**
 * La colonne de gauche de l'app : créer, chercher, naviguer, et le compte. La
 * même sur la home et sur un canvas, pour qu'on s'y retrouve partout.
 *
 * `onNavigate` referme la sheet qui l'accueille sur mobile, dès qu'on a choisi
 * où aller. `children` s'insère entre la navigation et le pied, dans une zone
 * qui scrolle — le canvas y met la liste des canvas.
 *
 * `live: false` coupe les queries du badge Inbox et de l'usage IA : sur un
 * canvas la sidebar est repliée la plupart du temps mais reste montée, et la
 * query des tâches se réévalue à chaque step d'un tour en cours.
 */
export default function AppSidebar({
  onNavigate,
  children,
  live = true,
}: {
  onNavigate?: () => void;
  children?: ReactNode;
  live?: boolean;
}) {
  const openCommandCenter = useCommandCenterStore((state) => state.open);
  const { tasks } = useHomePendingTasks({ enabled: live });
  const taskCanvases = useTaskCanvases();
  // Même filtre que la liste : une tâche d'un canvas qu'on ne voit plus n'est
  // pas comptée, sans quoi le badge annoncerait des tâches introuvables.
  const pendingCount = tasks.filter((task) =>
    taskCanvases.has(task.canvasId),
  ).length;

  return (
    <div className="flex h-full flex-col gap-5 px-3 pt-4 pb-3">
      <Link
        to="/"
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-2 py-0.5"
      >
        <img src="/favicon.svg" alt="" className="size-7" />
        <span className="text-[17px] font-bold tracking-tight text-slate-900">
          Nolënor
        </span>
      </Link>

      <div className="flex flex-col gap-2">
        <NewCanvasButton className="w-full justify-start" />
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            openCommandCenter();
          }}
          className="flex h-10 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
        >
          <TbSearch className="size-4 shrink-0" />
          <span className="flex-1 text-left">Search</span>
          <KbdGroup className="max-sm:hidden">
            <Kbd>⌘</Kbd>
            <Kbd>P</Kbd>
          </KbdGroup>
        </button>
      </div>

      <nav aria-label="Main" className="flex flex-col gap-0.5">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            activeOptions={{ exact: true }}
            className="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200/60"
            activeProps={{
              className:
                "bg-white font-bold text-brand shadow-sm hover:bg-white",
            }}
          >
            <item.icon className="size-[18px] shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.to === "/inbox" && pendingCount > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-violet-600 px-1.5 text-[11px] font-bold text-white">
                {pendingCount}
              </span>
            )}
          </Link>
        ))}
      </nav>

      {children ? (
        <div className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3">
          {children}
        </div>
      ) : (
        <div className="flex-1" />
      )}

      <div className="flex flex-col gap-1 border-t border-slate-200 pt-3">
        <AiUsageLink onNavigate={onNavigate} live={live} />
        <AccountMenu />
      </div>
    </div>
  );
}

/**
 * Ce que Nolë a coûté sur trente jours, en une valeur. Pas de jauge : il n'y a
 * pas de plafond à mesurer. Mène au détail, dans les settings.
 */
function AiUsageLink({
  onNavigate,
  live,
}: {
  onNavigate?: () => void;
  live: boolean;
}) {
  const usage = useAiUsage("30d", { enabled: live });
  const location = useLocation();

  return (
    <Link
      to="/settings/ai-usage"
      state={{ from: location.href }}
      onClick={onNavigate}
      className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-xs transition-colors hover:bg-slate-200/60"
    >
      <span className="flex flex-col">
        <span className="font-semibold text-slate-700">AI usage</span>
        <span className="text-slate-500">Last 30 days</span>
      </span>
      <span className="text-sm font-bold text-slate-900 tabular-nums">
        {usage.isLoading ? "—" : formatCostCompact(usage.totalCostUsd)}
      </span>
    </Link>
  );
}

/**
 * Le compte et les réglages, en une seule entrée : l'avatar ouvre un menu qui
 * mène aux settings ou déconnecte.
 */
function AccountMenu() {
  const me = useQuery(api.users.me);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();
  const location = useLocation();

  const name = me?.displayName ?? me?.email ?? "Your account";
  const initial = Array.from(name.trim())[0]?.toUpperCase() ?? "?";

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success("You have been signed out");
      void navigate({ to: "/signin" });
    } catch (error) {
      console.error("Logout error:", error);
      toast.error("Error signing out");
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-11 items-center gap-2.5 rounded-lg px-2 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200/60",
            "data-[state=open]:bg-slate-200/60",
          )}
        >
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <TbChevronDown className="size-4 shrink-0 text-slate-500" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        {me?.email && (
          <>
            <DropdownMenuLabel className="truncate text-xs font-normal text-slate-500">
              {me.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem asChild>
          <Link to="/settings" state={{ from: location.href }}>
            <TbSettings />
            Settings
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => void handleSignOut()}>
          <TbLogout />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
