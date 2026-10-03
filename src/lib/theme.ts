import { useSyncExternalStore } from "react";

/**
 * Thème de l'app (clair / sombre / système).
 *
 * Stocké en localStorage pour l'instant : la préférence suit le navigateur,
 * pas le compte. Le script inline d'index.html lit la même clé avant le
 * premier paint pour éviter un flash blanc — garder les deux synchronisés.
 */
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "nolenor-theme";

const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: "#ffffff",
  dark: "#0b1020",
};

const darkQuery =
  typeof window !== "undefined"
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage indisponible (navigation privée stricte…) : défaut.
  }
  return "light";
}

function resolve(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return darkQuery?.matches ? "dark" : "light";
  return preference;
}

let preference: ThemePreference = readPreference();
let resolved: ResolvedTheme = resolve(preference);
const listeners = new Set<() => void>();

function applyToDocument(theme: ResolvedTheme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLOR[theme]);
}

function update() {
  resolved = resolve(preference);
  applyToDocument(resolved);
  listeners.forEach((listener) => listener());
}

export function setThemePreference(next: ThemePreference) {
  preference = next;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Ignoré : le thème s'applique quand même pour la session.
  }
  update();
}

if (typeof window !== "undefined") {
  applyToDocument(resolved);
  darkQuery?.addEventListener("change", () => {
    if (preference === "system") update();
  });
  // Un autre onglet a changé le thème.
  window.addEventListener("storage", (event) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    preference = readPreference();
    update();
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => preference);
}

/** Thème effectivement affiché, `system` résolu. */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, () => resolved);
}
