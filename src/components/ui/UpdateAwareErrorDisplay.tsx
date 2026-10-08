import { useEffect, useState, type ReactNode } from "react";
import { TbSparkles } from "react-icons/tb";
import { Button } from "@/components/shadcn/button";
import { Spinner } from "@/components/shadcn/spinner";
import ErrorDisplay from "@/components/ui/ErrorDisplay";
import { useAppUpdateStatus } from "@/hooks/useAppUpdateStatus";
import { applyUpdate, checkForUpdate } from "@/lib/appUpdate";

/**
 * Délai max pendant lequel on retient l'écran d'erreur le temps de savoir si
 * une mise à jour l'explique. Au-delà (réseau lent), on montre l'erreur : le
 * bouton Reload revérifie de toute façon avant de recharger.
 */
const INITIAL_CHECK_GRACE_MS = 4_000;

/**
 * Écran d'erreur qui sait qu'un déploiement est la cause la plus probable.
 *
 * Juste après une mise en prod, le front PWA tourne encore sur l'ancien build
 * pendant que le backend Convex est déjà à jour : une query ou une mutation
 * disparue ou modifiée plante. Ce n'est pas une panne, juste une mise à jour
 * pas encore appliquée. Au montage on vérifie donc s'il existe un nouveau
 * build ; si oui, l'erreur laisse place à un message positif pendant le
 * téléchargement, puis on recharge (ou on propose de recharger).
 *
 * `autoReload` : à activer quand l'écran remplace toute l'app (rien à perdre
 * en rechargeant). À laisser éteint pour une erreur locale (une fenêtre de
 * node), où d'autres fenêtres ouvertes peuvent contenir des brouillons.
 */
export default function UpdateAwareErrorDisplay({
  title,
  message,
  error,
  secondaryActions,
  reloadLabel = "Reload the page",
  autoReload = false,
}: {
  title: string;
  message?: string;
  error?: Error | null;
  secondaryActions?: ReactNode;
  reloadLabel?: string;
  autoReload?: boolean;
}) {
  const status = useAppUpdateStatus();
  const [initialCheckDone, setInitialCheckDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const markDone = () => {
      if (!cancelled) setInitialCheckDone(true);
    };
    void checkForUpdate().then(markDone);
    const timer = window.setTimeout(markDone, INITIAL_CHECK_GRACE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    if (autoReload && status === "ready") applyUpdate();
  }, [autoReload, status]);

  const updateInProgress =
    status === "downloading" || status === "ready" || status === "reloading";

  if (updateInProgress) {
    const busy = autoReload || status !== "ready";
    return (
      <ErrorDisplay
        icon={<TbSparkles />}
        title="✨ Nolënor just got an update"
        message={
          autoReload
            ? "A new version was released while you were working. It's downloading now and the page will refresh by itself in a few seconds — your work is saved."
            : "A new version was released while you were working. Reload the page to start using it — your work is saved."
        }
        cta={
          <Button onClick={applyUpdate} disabled={busy}>
            {busy && <Spinner />}
            {status === "downloading"
              ? "Downloading the new version…"
              : status === "reloading" || autoReload
                ? "Refreshing…"
                : "Reload to update"}
          </Button>
        }
      />
    );
  }

  // Le temps de savoir si une mise à jour explique l'erreur : pas d'écran
  // d'erreur qui s'afficherait une seconde avant d'être remplacé.
  if (!initialCheckDone) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  const checking = status === "checking";
  return (
    <ErrorDisplay
      title={title}
      message={message}
      error={error}
      cta={
        <div className="flex flex-wrap justify-center gap-2">
          {secondaryActions}
          <Button onClick={applyUpdate} disabled={checking}>
            {checking && <Spinner />}
            {checking ? "Checking for updates…" : reloadLabel}
          </Button>
        </div>
      }
    />
  );
}
