import type { IconType } from "react-icons";
import {
  TbFileTypePdf,
  TbAbc,
  TbPhoto,
  TbLink,
  TbTag,
  TbApi,
  TbTable,
  TbAppWindow,
  TbNotes,
  TbTemplate,
  TbMusic,
  TbVideo,
  TbFrame,
} from "react-icons/tb";

export const NODE_TYPE_ICON_MAP: Record<string, IconType> = {
  title: TbAbc,
  blocknote: TbNotes,
  image: TbPhoto,
  link: TbLink,
  pdf: TbFileTypePdf,
  value: TbTag,
  fetch: TbApi,
  table: TbTable,
  app: TbAppWindow,
  audio: TbMusic,
  video: TbVideo,
  frame: TbFrame,
  // Fallback générique pour les custom nodes ; les surfaces qui connaissent
  // le template affichent son icône propre (cf. getTemplateIcon).
  custom: TbTemplate,
};
