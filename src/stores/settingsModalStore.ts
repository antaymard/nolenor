import { create } from "zustand";
import type { CanvasBackground } from "@/lib/canvasBackground";
import type { SettingsSectionKey } from "@/components/settings/settingsSections";

/**
 * Les réglages ouverts en modale par-dessus un canvas (cf. `SettingsModal`) :
 * le canvas reste monté dessous, sa vue et ses windows intactes à la
 * fermeture. Hors canvas, les réglages restent une page (`/settings`).
 */
interface SettingsModalStore {
  /** La section affichée ; `null` = modale fermée. */
  section: SettingsSectionKey | null;
  /**
   * Bouton « maintenir pour voir » enfoncé : la modale s'estompe, le canvas
   * apparaît dessous.
   */
  peeking: boolean;
  /**
   * Le fond en cours de réglage, pas encore enregistré : le canvas l'affiche à
   * la place du sien tant qu'il est posé, pour que le coup d'œil montre le
   * brouillon et non l'état enregistré.
   */
  backgroundPreview: CanvasBackground | null;
  open: (section?: SettingsSectionKey) => void;
  setSection: (section: SettingsSectionKey) => void;
  close: () => void;
  setPeeking: (peeking: boolean) => void;
  setBackgroundPreview: (background: CanvasBackground | null) => void;
}

export const useSettingsModalStore = create<SettingsModalStore>()((set) => ({
  section: null,
  peeking: false,
  backgroundPreview: null,
  open: (section = "account") => set({ section }),
  setSection: (section) => set({ section, peeking: false }),
  close: () => set({ section: null, peeking: false, backgroundPreview: null }),
  setPeeking: (peeking) => set({ peeking }),
  setBackgroundPreview: (backgroundPreview) => set({ backgroundPreview }),
}));
