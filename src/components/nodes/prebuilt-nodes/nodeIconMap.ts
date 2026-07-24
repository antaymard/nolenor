import type { IconType } from "react-icons";
import {
  TbFileTypePdf,
  TbAbc,
  TbPhoto,
  TbLink,
  TbTag,
  TbApi,
  TbNews,
  TbCode,
  TbTable,
  TbAppWindow,
  TbNotes,
} from "react-icons/tb";

export const NODE_TYPE_ICON_MAP: Record<string, IconType> = {
  title: TbAbc,
  document: TbNews,
  blocknote: TbNotes,
  image: TbPhoto,
  link: TbLink,
  pdf: TbFileTypePdf,
  value: TbTag,
  fetch: TbApi,
  embed: TbCode,
  table: TbTable,
  app: TbAppWindow,
};
