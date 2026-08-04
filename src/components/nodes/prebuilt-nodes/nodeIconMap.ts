import type { IconType } from "react-icons";
import {
  TbFileTypePdf,
  TbAbc,
  TbPhoto,
  TbLink,
  TbTag,
  TbApi,
  TbCode,
  TbTable,
  TbAppWindow,
  TbNotes,
  TbTemplate,
  TbMusic,
} from "react-icons/tb";

export const NODE_TYPE_ICON_MAP: Record<string, IconType> = {
  title: TbAbc,
  blocknote: TbNotes,
  image: TbPhoto,
  link: TbLink,
  pdf: TbFileTypePdf,
  value: TbTag,
  fetch: TbApi,
  embed: TbCode,
  table: TbTable,
  app: TbAppWindow,
  audio: TbMusic,
  // Fallback générique pour les custom nodes ; les surfaces qui connaissent
  // le template affichent son icône propre (cf. getTemplateIcon).
  custom: TbTemplate,
};
