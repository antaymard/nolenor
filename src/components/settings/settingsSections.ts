import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import type { IconType } from "react-icons";
import {
  TbBrain,
  TbBulb,
  TbCategory,
  TbChartBar,
  TbFileExport,
  TbKey,
  TbListDetails,
  TbPalette,
  TbUser,
} from "react-icons/tb";
import type { Id } from "@/../convex/_generated/dataModel";
import { SHOW_DEV_ONLY_SETTINGS } from "@/lib/featureFlags";

/**
 * Ce qu'une page des réglages peut recevoir de son contexte. Ouverte depuis un
 * canvas (modale), `canvasId` est ce canvas : les pages qui en dépendent s'y
 * placent par défaut (Canvas, Recipes). Ouverte par sa route, c'est absent,
 * ou lu dans l'URL.
 */
export type SettingsPageProps = { canvasId?: Id<"canvases"> };

export type SettingsSectionKey =
  | "account"
  | "ai-usage"
  | "export"
  | "templates"
  | "skills"
  | "canvas"
  | "memories"
  | "recipes"
  | "api-tokens";

export type SettingsSection = {
  key: SettingsSectionKey;
  label: string;
  icon: IconType;
  /** Entrée réservée au dev, cf. lib/featureFlags.ts. */
  devOnly?: boolean;
  /**
   * La page prend toute la largeur (liste et éditeur côte à côte), au lieu
   * du `max-w-5xl` des autres.
   */
  fullWidth?: boolean;
  /**
   * Chargée à la demande : la modale des réglages vit dans la route canvas,
   * qui ne doit pas embarquer toutes les pages.
   */
  Page: LazyExoticComponent<ComponentType<SettingsPageProps>>;
};

export type SettingsGroup = { label: string; sections: SettingsSection[] };

// Trois groupes, et rien d'autre : ce qu'on est (Account), ce qu'on fabrique
// pour le canvas (Customization), ce qu'on branche dessus (Developer).
const settingsGroups: SettingsGroup[] = [
  {
    label: "Account",
    sections: [
      {
        key: "account",
        label: "Account",
        icon: TbUser,
        Page: lazy(() => import("./pages/AccountSettingsPage")),
      },
      {
        key: "ai-usage",
        label: "AI usage",
        icon: TbChartBar,
        Page: lazy(() => import("./pages/AiUsageSettingsPage")),
      },
      {
        key: "export",
        label: "Export my data",
        icon: TbFileExport,
        Page: lazy(() => import("./pages/ExportSettingsPage")),
      },
    ],
  },
  {
    label: "Customization",
    sections: [
      {
        key: "templates",
        label: "Custom nodes",
        icon: TbCategory,
        devOnly: true,
        Page: lazy(() => import("./pages/TemplatesSettingsPage")),
      },
      {
        key: "skills",
        label: "Skills",
        icon: TbBulb,
        Page: lazy(() => import("./pages/SkillsSettingsPage")),
      },
      {
        key: "canvas",
        label: "Canvas",
        icon: TbPalette,
        Page: lazy(() => import("./pages/CanvasSettingsPage")),
      },
      {
        key: "memories",
        label: "Agent Memory",
        icon: TbBrain,
        Page: lazy(() => import("./pages/MemoriesSettingsPage")),
      },
      {
        key: "recipes",
        label: "Recipes",
        icon: TbListDetails,
        devOnly: true,
        fullWidth: true,
        Page: lazy(() => import("./pages/RecipesSettingsPage")),
      },
    ],
  },
  {
    label: "Developer",
    sections: [
      {
        key: "api-tokens",
        label: "MCP & API tokens",
        icon: TbKey,
        Page: lazy(() => import("./pages/ApiTokensSettingsPage")),
      },
    ],
  },
];

/**
 * Les groupes à afficher : sans les entrées réservées au dev en production,
 * et sans un groupe dont il ne resterait que le titre.
 */
export const visibleSettingsGroups: SettingsGroup[] = settingsGroups
  .map((group) => ({
    ...group,
    sections: group.sections.filter(
      (section) => !section.devOnly || SHOW_DEV_ONLY_SETTINGS,
    ),
  }))
  .filter((group) => group.sections.length > 0);

export function findSettingsSection(
  key: string | null | undefined,
): SettingsSection | undefined {
  return visibleSettingsGroups
    .flatMap((group) => group.sections)
    .find((section) => section.key === key);
}

export const DEFAULT_SETTINGS_SECTION: SettingsSectionKey = "account";
