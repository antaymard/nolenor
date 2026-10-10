import { create } from "zustand";
import type { SettingsSectionKey } from "@/components/settings/settingsSections";

/**
 * Les réglages ouverts en modale par-dessus un canvas (cf. `SettingsModal`) :
 * le canvas reste monté dessous, sa vue et ses windows intactes à la
 * fermeture. Hors canvas, les réglages restent une page (`/settings`).
 */
interface SettingsModalStore {
  /** La section affichée ; `null` = modale fermée. */
  section: SettingsSectionKey | null;
  open: (section?: SettingsSectionKey) => void;
  setSection: (section: SettingsSectionKey) => void;
  close: () => void;
}

export const useSettingsModalStore = create<SettingsModalStore>()((set) => ({
  section: null,
  open: (section = "account") => set({ section }),
  setSection: (section) => set({ section }),
  close: () => set({ section: null }),
}));
