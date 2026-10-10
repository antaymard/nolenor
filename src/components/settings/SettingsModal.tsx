import { Suspense, useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  NAV_ITEM_ACTIVE_CLASS,
  NAV_ITEM_CLASS,
} from "@/components/app-shell/navItemStyles";
import { Spinner } from "@/components/shadcn/spinner";
import { cn } from "@/lib/utils";
import { useCanvasStore } from "@/stores/canvasStore";
import { useSettingsModalStore } from "@/stores/settingsModalStore";
import SettingsShell from "./SettingsShell";
import {
  DEFAULT_SETTINGS_SECTION,
  findSettingsSection,
} from "./settingsSections";

/**
 * Les réglages en modale quasi plein écran, par-dessus le canvas : le canvas
 * reste monté dessous (vue, sélection, windows, conversation), là où la page
 * `/settings` le démontait. La navigation entre sections est un état local,
 * pas une URL.
 *
 * `canvasId` est le canvas ouvert : les pages qui en dépendent s'y placent par
 * défaut (Canvas, Recipes).
 */
export default function SettingsModal({
  canvasId,
}: {
  canvasId: Id<"canvases">;
}) {
  const sectionKey = useSettingsModalStore((state) => state.section);
  const setSection = useSettingsModalStore((state) => state.setSection);
  const close = useSettingsModalStore((state) => state.close);
  const setFocus = useCanvasStore((state) => state.setFocus);
  const releaseFocus = useCanvasStore((state) => state.releaseFocus);
  const open = sectionKey !== null;
  const section =
    findSettingsSection(sectionKey) ??
    findSettingsSection(DEFAULT_SETTINGS_SECTION)!;

  // Le clavier appartient à la modale : les raccourcis nus du canvas (T, D,
  // Backspace…) testent `focus === "canvas"` et se taisent.
  useEffect(() => {
    if (!open) return;
    setFocus("modal");
    return () => releaseFocus("modal");
  }, [open, setFocus, releaseFocus]);

  // Un lien d'une page (ouvrir la conversation d'un run…) mène ailleurs :
  // la modale se ferme plutôt que de rester par-dessus la destination.
  const location = useRouterState({ select: (state) => state.location.href });
  const openedAt = useRef(location);
  useEffect(() => {
    if (open) openedAt.current = location;
    // Ne dépend que de l'ouverture : on mémorise l'URL au moment où elle a lieu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  useEffect(() => {
    if (open && location !== openedAt.current) close();
  }, [open, location, close]);

  // Changer de canvas, ou le quitter, referme la modale.
  useEffect(() => close, [canvasId, close]);

  const Page = section.Page;

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-slate-950/30 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 overflow-hidden bg-surface shadow-[0_12px_40px_rgba(15,23,42,0.18)] duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] md:inset-6 md:rounded-2xl md:border md:border-slate-200"
        >
          <DialogPrimitive.Title className="sr-only">
            Settings
          </DialogPrimitive.Title>
          <SettingsShell
            className="h-full"
            onClose={close}
            hasCanvas
            fullWidth={section.fullWidth}
            renderNavItem={(item, onNavigate) => {
              const Icon = item.icon;
              const active = item.key === section.key;
              return (
                <button
                  type="button"
                  onClick={() => {
                    setSection(item.key);
                    onNavigate?.();
                  }}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    NAV_ITEM_CLASS,
                    "w-full text-left",
                    active && NAV_ITEM_ACTIVE_CLASS,
                  )}
                >
                  <Icon className="size-[18px] shrink-0" />
                  <span className="flex-1">{item.label}</span>
                </button>
              );
            }}
          >
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Spinner className="size-6 text-muted-foreground" />
                </div>
              }
            >
              {/* Remontée par section : l'état d'une page ne fuit pas dans
                  la suivante. */}
              <Page key={section.key} canvasId={canvasId} />
            </Suspense>
          </SettingsShell>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
