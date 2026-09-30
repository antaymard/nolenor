import { useEffect, useState } from "react";

type UseTypewriterPlaceholderOptions = {
  /** Vitesse de frappe, en ms par caractère. */
  typeSpeedMs?: number;
  /** Vitesse d'effacement, en ms par caractère. */
  deleteSpeedMs?: number;
  /** Pause une fois la phrase complète affichée. */
  pauseFullMs?: number;
  /** Pause une fois la phrase effacée, avant la suivante. */
  pauseEmptyMs?: number;
  /** Quand `false`, l'animation se fige (ex. l'utilisateur a commencé à taper). */
  enabled?: boolean;
};

/**
 * Placeholder « machine à écrire » : tape une suggestion lettre par lettre,
 * la laisse lisible un moment, l'efface, puis passe à la suivante en boucle.
 *
 * Volontairement un simple `string` (et non un composant animé) : un
 * `placeholder` natif ne peut pas rendre du JSX, donc une lib type slot-machine
 * obligerait à superposer un faux placeholder — sync focus/clic/a11y en plus.
 * Ici on ne fait que changer la string, `RichTextArea` n'a rien à apprendre.
 *
 * `prefers-reduced-motion` respecté : première phrase figée, sans boucle.
 */
export function useTypewriterPlaceholder(
  phrases: readonly string[],
  {
    typeSpeedMs = 38,
    deleteSpeedMs = 16,
    pauseFullMs = 2000,
    pauseEmptyMs = 450,
    enabled = true,
  }: UseTypewriterPlaceholderOptions = {},
): string {
  const fallback = phrases[0] ?? "";
  const [text, setText] = useState(fallback);

  useEffect(() => {
    if (phrases.length === 0) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setText(phrases[0] ?? "");
      return;
    }
    if (!enabled) return;

    let phraseIndex = 0;
    let charIndex = phrases[0]?.length ?? 0;
    let deleting = true;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    // Petite gigue humaine (±25 %) pour éviter le métronome parfait.
    const jitter = (base: number) => base * (0.75 + Math.random() * 0.5);

    const tick = () => {
      if (cancelled) return;
      const current = phrases[phraseIndex % phrases.length] ?? "";

      if (deleting) {
        charIndex -= 1;
        setText(current.slice(0, Math.max(0, charIndex)));
        if (charIndex <= 0) {
          deleting = false;
          phraseIndex = (phraseIndex + 1) % phrases.length;
          timer = setTimeout(tick, pauseEmptyMs);
        } else {
          timer = setTimeout(tick, jitter(deleteSpeedMs));
        }
        return;
      }

      charIndex += 1;
      setText(current.slice(0, charIndex));
      if (charIndex >= current.length) {
        deleting = true;
        timer = setTimeout(tick, pauseFullMs);
      } else {
        timer = setTimeout(tick, jitter(typeSpeedMs));
      }
    };

    // On part de la première phrase déjà affichée, on la laisse lire avant
    // d'effacer — pas d'effacement immédiat au montage.
    timer = setTimeout(tick, pauseFullMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    deleteSpeedMs,
    enabled,
    pauseEmptyMs,
    pauseFullMs,
    phrases,
    typeSpeedMs,
  ]);

  return text;
}
