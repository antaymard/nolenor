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
    border: "border-[#9cbcf4]",
    bg: "bg-[#dee7fb]",
    darkBg: "bg-[#c5d6f8]",
    plain: "bg-[#3758d9]",
    text: "text-[#3758d9]",
    transparentBg: "bg-[#577ee7]/20",
  },
  green: {
    label: "Green",
    border: "border-[#85d0b0]",
    bg: "bg-[#d9f2e4]",
    darkBg: "bg-[#b6e4ce]",
    plain: "bg-[#217a5c]",
    text: "text-[#217a5c]",
    transparentBg: "bg-[#309973]/20",
  },
  red: {
    label: "Red",
    border: "border-red-300",
    bg: "bg-red-100",
    darkBg: "bg-red-200",
    plain: "bg-red-600",
    text: "text-red-600",
    transparentBg: "bg-red-500/20",
  },
  pink: {
    //#8e4478
    label: "Pink",
    border: "border-[#d89ac8]",
    bg: "bg-[#f2dcee]",
    darkBg: "bg-[#f2dcee]",
    plain: "bg-[#a75290]",
    text: "text-[#a75290]",
    transparentBg: "bg-[#c471af]/20",
  },
  orange: {
    label: "Orange",
    border: "border-orange-300",
    bg: "bg-orange-100",
    darkBg: "bg-orange-200",
    plain: "bg-orange-600",
    text: "text-orange-600",
    transparentBg: "bg-orange-500/20",
  },
  yellow: {
    label: "Yellow",
    border: "border-yellow-300",
    bg: "bg-yellow-100",
    darkBg: "bg-yellow-200",
    plain: "bg-yellow-600",
    text: "text-yellow-600",
    transparentBg: "bg-yellow-500/20",
  },
  purple: {
    label: "Purple",
    border: "border-purple-300",
    bg: "bg-purple-100",
    darkBg: "bg-purple-200",
    plain: "bg-purple-600",
    text: "text-purple-600",
    transparentBg: "bg-purple-500/20",
  },
  default: {
    label: "Default",
    border: "border-slate-300",
    bg: "bg-slate-100",
    darkBg: "bg-slate-200",
    plain: "bg-slate-600",
    text: "text-slate-500",
    transparentBg: "bg-slate-500/20",
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
