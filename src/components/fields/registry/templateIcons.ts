import type { IconType } from "react-icons";
import {
  TbBook,
  TbBox,
  TbBriefcase,
  TbBulb,
  TbCalendarEvent,
  TbChecklist,
  TbFlag,
  TbHeart,
  TbNotes,
  TbStar,
  TbTag,
  TbTemplate,
  TbUser,
} from "react-icons/tb";

// Set curaté d'icônes pour les custom node templates. En DB on stocke le
// nom (string), jamais le composant.
const templateIconMap: Record<string, IconType> = {
  template: TbTemplate,
  box: TbBox,
  notes: TbNotes,
  user: TbUser,
  calendar: TbCalendarEvent,
  checklist: TbChecklist,
  star: TbStar,
  flag: TbFlag,
  tag: TbTag,
  book: TbBook,
  briefcase: TbBriefcase,
  bulb: TbBulb,
  heart: TbHeart,
};

const templateIconNames = Object.keys(templateIconMap);

function getTemplateIcon(name?: string | null): IconType {
  return (name && templateIconMap[name]) || TbTemplate;
}

export { templateIconMap, templateIconNames, getTemplateIcon };
