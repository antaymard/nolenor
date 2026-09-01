import type { IconType } from "react-icons";
import { TbBrandGithub, TbBrandGoogle, TbPlug } from "react-icons/tb";

/**
 * `providersConfig` ne porte qu'un NOM d'icône : la config est partagée avec le
 * backend, où un composant React n'a rien à faire. La résolution vit donc ici,
 * côté front, sur le modèle de `NODE_TYPE_ICON_MAP`.
 */
const PROVIDER_ICONS: Record<string, IconType> = {
  TbBrandGoogle,
  TbBrandGithub,
};

export function resolveProviderIcon(name: string): IconType {
  return PROVIDER_ICONS[name] ?? TbPlug;
}
