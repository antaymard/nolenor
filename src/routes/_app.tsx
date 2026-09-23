import { useEffect, useState } from "react";
import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { TbMenu2 } from "react-icons/tb";
import AppSidebar from "@/components/app-shell/AppSidebar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/shadcn/sheet";
import { Spinner } from "@/components/shadcn/spinner";

/**
 * Le shell des pages hors canvas — Home, Inbox, Tutorials : la sidebar à
 * gauche, la page à droite.
 *
 * Route sans segment d'URL (`_app`) : elle ne fait qu'envelopper ses filles, et
 * la sidebar reste montée quand on passe de l'une à l'autre.
 *
 * Le garde d'auth vit ici, pour toutes les pages du shell : elles exigent une
 * session, et le visiteur anonyme est renvoyé vers `/signin`.
 */
export const Route = createFileRoute("/_app")({
  component: RouteComponent,
});

function RouteComponent() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const navigate = useNavigate();
  // Sur mobile la sidebar ne tient pas à côté du contenu : elle passe dans une
  // sheet, ouverte depuis la barre du haut et refermée dès qu'on navigue.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      void navigate({ to: "/signin" });
    }
  }, [isLoading, isAuthenticated, navigate]);

  // Le temps de savoir, et pendant la redirection : ni la page ni un écran
  // vide, qui clignoteraient l'un comme l'autre.
  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-dvh w-full items-center justify-center bg-white">
        <Spinner className="animate-appear size-6 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full bg-white">
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-50 md:block">
        <AppSidebar />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barre du haut, mobile seulement : le menu et le logo. */}
        <div
          className="flex shrink-0 items-center gap-2 border-b border-slate-200 px-3 py-2 md:hidden"
          style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={() => setNavOpen(true)}
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Open menu"
          >
            <TbMenu2 size={18} />
          </button>
          <Link to="/" className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-6" />
            <span className="font-extrabold tracking-tight text-slate-900">
              Nolënor
            </span>
          </Link>
        </div>

        {/* `min-h-0` + `overflow-y-auto` : le shell root est en
            `overflow-hidden` à hauteur fixe, le scroll doit avoir lieu ici.
            `touch-pan-y` garantit le pan tactile vertical,
            `overscroll-y-contain` évite le chaînage au body. */}
        <main className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-y-contain">
          <Outlet />
        </main>
      </div>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent side="left" className="w-72 gap-0 bg-slate-50 p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>
          <AppSidebar onNavigate={() => setNavOpen(false)} />
        </SheetContent>
      </Sheet>
    </div>
  );
}
