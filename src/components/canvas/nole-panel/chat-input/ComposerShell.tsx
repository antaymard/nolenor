import { BorderBeam } from "border-beam";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Rayon du composer. Partagé entre la surface et le halo pour que les deux
 *  arrondis coïncident : le wrapper du beam recadre son contenu. */
const COMPOSER_RADIUS_PX = 14;

type ComposerShellProps = {
  children: ReactNode;
  /** Le halo respire pendant que l'assistant travaille. */
  isPulsing: boolean;
  /** Des fenêtres non enregistrées bloquent l'envoi : la bordure passe au rouge. */
  hasDirtyWindows: boolean;
  className?: string;
};

/**
 * Surface du composer, partagée par le panneau desktop et l'écran mobile : une
 * carte blanche entourée d'un halo `border-beam` qui pulse tant que l'assistant
 * répond. L'ombre vit sur le wrapper du halo, pas sur la carte — le wrapper est
 * en `overflow: hidden` et rognerait l'ombre d'un enfant.
 */
export default function ComposerShell({
  children,
  isPulsing,
  hasDirtyWindows,
  className,
}: ComposerShellProps) {
  return (
    <BorderBeam
      size="pulse-inner"
      colorVariant="ocean"
      theme="light"
      active={isPulsing}
      // Halo volontairement sobre : la teinte reste dans le bleu de la marque
      // au lieu de balayer tout le spectre.
      strength={0.7}
      hueRange={12}
      borderRadius={COMPOSER_RADIUS_PX}
      className={cn(
        "w-full shadow-sm transition-shadow duration-200 focus-within:shadow-md",
        className,
      )}
    >
      <div
        style={{ borderRadius: COMPOSER_RADIUS_PX }}
        className={cn(
          "flex flex-col bg-white transition-colors duration-200",
          hasDirtyWindows
            ? "border border-red-300"
            : "border border-slate-300 focus-within:border-slate-400",
        )}
      >
        {children}
      </div>
    </BorderBeam>
  );
}
