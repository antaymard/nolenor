import { cn } from "@/lib/utils";

// Forme d'equalizer : barres centrales plus hautes, pour un rendu sobre de VU-mètre.
const BAR_WEIGHTS = [0.5, 0.8, 1, 0.8, 0.5];
const MIN_HEIGHT = 22; // % — les barres restent visibles au repos
const GAIN = 1.6; // sensibilité à la voix

/**
 * Equalizer piloté par le niveau micro réel (`level`, 0..1) : il réagit à la
 * voix au fil de la parole. La couleur est héritée (`bg-current`) pour s'adapter
 * au contexte (rouge sur "Écoute…", blanc sur le bouton mobile). Sans `level`,
 * les barres restent au repos.
 */
export default function SoundWaveAnimation({
  level = 0,
  className,
}: {
  /** Niveau micro 0..1. Quand fourni, les barres suivent la voix. */
  level?: number;
  className?: string;
}) {
  const l = Math.max(0, Math.min(1, level));

  return (
    <div className={cn("flex items-center gap-0.75 h-5", className)}>
      {BAR_WEIGHTS.map((weight, i) => {
        const height = MIN_HEIGHT + (100 - MIN_HEIGHT) * Math.min(1, l * GAIN * weight);
        return (
          <div
            key={i}
            className="w-0.75 rounded-full bg-current transition-[height] duration-100 ease-out"
            style={{ height: `${height}%` }}
          />
        );
      })}
    </div>
  );
}
