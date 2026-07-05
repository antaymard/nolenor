import type { colorsEnum } from "@/types/domain";

const colors: Record<
  colorsEnum,
  {
    border: string;
    bg: string;
    darkBg: string;
    plain: string;
    text: string;
    label: string;
    transparentBg?: string;
  }
> = {
  blue: {
    label: "Blue",
    border: "border-[var(--tag-blue-border)]",
    bg: "bg-[var(--tag-blue-soft)]",
    darkBg: "bg-[var(--tag-blue-border)]/40",
    plain: "bg-[var(--tag-blue-solid)]",
    text: "text-[var(--tag-blue-text)]",
    transparentBg: "bg-[var(--tag-blue-solid)]/18",
  },
  green: {
    label: "Green",
    border: "border-[var(--tag-green-border)]",
    bg: "bg-[var(--tag-green-soft)]",
    darkBg: "bg-[var(--tag-green-border)]/40",
    plain: "bg-[var(--tag-green-solid)]",
    text: "text-[var(--tag-green-text)]",
    transparentBg: "bg-[var(--tag-green-solid)]/18",
  },
  red: {
    label: "Red",
    border: "border-[var(--tag-red-border)]",
    bg: "bg-[var(--tag-red-soft)]",
    darkBg: "bg-[var(--tag-red-border)]/40",
    plain: "bg-[var(--tag-red-solid)]",
    text: "text-[var(--tag-red-text)]",
    transparentBg: "bg-[var(--tag-red-solid)]/18",
  },
  pink: {
    label: "Pink",
    border: "border-[var(--tag-pink-border)]",
    bg: "bg-[var(--tag-pink-soft)]",
    darkBg: "bg-[var(--tag-pink-border)]/40",
    plain: "bg-[var(--tag-pink-solid)]",
    text: "text-[var(--tag-pink-text)]",
    transparentBg: "bg-[var(--tag-pink-solid)]/18",
  },
  orange: {
    label: "Orange",
    border: "border-[var(--tag-orange-border)]",
    bg: "bg-[var(--tag-orange-soft)]",
    darkBg: "bg-[var(--tag-orange-border)]/40",
    plain: "bg-[var(--tag-orange-solid)]",
    text: "text-[var(--tag-orange-text)]",
    transparentBg: "bg-[var(--tag-orange-solid)]/18",
  },
  yellow: {
    label: "Yellow",
    border: "border-[var(--tag-yellow-border)]",
    bg: "bg-[var(--tag-yellow-soft)]",
    darkBg: "bg-[var(--tag-yellow-border)]/40",
    plain: "bg-[var(--tag-yellow-solid)]",
    text: "text-[var(--tag-yellow-text)]",
    transparentBg: "bg-[var(--tag-yellow-solid)]/18",
  },
  purple: {
    label: "Purple",
    border: "border-[var(--tag-purple-border)]",
    bg: "bg-[var(--tag-purple-soft)]",
    darkBg: "bg-[var(--tag-purple-border)]/40",
    plain: "bg-[var(--tag-purple-solid)]",
    text: "text-[var(--tag-purple-text)]",
    transparentBg: "bg-[var(--tag-purple-solid)]/18",
  },
  default: {
    label: "Default",
    border: "border-border",
    bg: "bg-muted",
    darkBg: "bg-accent",
    plain: "bg-[var(--tag-slate-solid)]",
    text: "text-muted-foreground",
    transparentBg: "bg-muted",
  },
  transparent: {
    label: "Transparent",
    border: "border-transparent",
    bg: "bg-transparent",
    darkBg: "bg-transparent",
    plain: "bg-transparent",
    text: "",
  },
};

export default colors;
