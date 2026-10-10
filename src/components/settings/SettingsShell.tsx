import { Fragment, useState, type ReactNode } from "react";
import { TbArrowLeft, TbMenu2, TbX } from "react-icons/tb";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";
import { cn } from "@/lib/utils";
import {
  visibleSettingsGroups,
  type SettingsSection,
} from "./settingsSections";

type SettingsShellProps = {
  /**
   * Une entrée de la barre latérale. La route rend un `Link` (l'URL suit), la
   * modale un bouton (l'état est local, le canvas reste en place).
   * `onNavigate` referme la sheet mobile.
   */
  renderNavItem: (
    section: SettingsSection,
    onNavigate?: () => void,
  ) => ReactNode;
  onClose: () => void;
  /** La page en cours prend toute la largeur (cf. `SettingsSection.fullWidth`). */
  fullWidth?: boolean;
  className?: string;
  children: ReactNode;
};

/**
 * Le cadre des réglages : barre latérale grise à gauche, page blanche à droite,
 * barre du haut sur mobile. Partagé par la route `/settings` et par la modale
 * ouverte depuis un canvas, qui ne diffèrent que par la navigation.
 */
export default function SettingsShell({
  renderNavItem,
  onClose,
  fullWidth = false,
  className,
  children,
}: SettingsShellProps) {
  // Sur mobile la barre latérale ne tient pas à côté du contenu : elle passe
  // dans une sheet, refermée dès qu'on navigue.
  const [navOpen, setNavOpen] = useState(false);

  const renderSidebar = (onNavigate?: () => void) => (
    <div className="flex h-full flex-col gap-5 px-3 pt-4 pb-3">
      <div className="flex items-center gap-2 px-1">
        <button
          type="button"
          onClick={onClose}
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
        {visibleSettingsGroups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <h2 className="px-3 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase">
              {group.label}
            </h2>
            {group.sections.map((section) => (
              <Fragment key={section.key}>
                {renderNavItem(section, onNavigate)}
              </Fragment>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );

  return (
    <div className={cn("flex w-full bg-surface", className)}>
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-50 md:block">
        {renderSidebar()}
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
            onClick={onClose}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Close settings"
          >
            <TbX size={18} />
          </button>
        </div>

        {/* La page scrolle ici, à l'intérieur du shell à hauteur fixe. Les
            pages en deux colonnes (Skills, Recipes) prennent `h-full` pour
            faire défiler leurs listes elles-mêmes. */}
        <main className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain px-4 py-8 md:px-10 md:py-10">
          <div className={cn("mx-auto h-full", !fullWidth && "max-w-5xl")}>
            {children}
          </div>
        </main>
      </div>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-72 gap-0 bg-slate-50 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Settings</SheetTitle>
          </SheetHeader>
          {renderSidebar(() => setNavOpen(false))}
        </SheetContent>
      </Sheet>
    </div>
  );
}
