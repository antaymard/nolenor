import type { NodeColor } from "@/../convex/config/colorsConfig";

/**
 * Classes Tailwind de chaque couleur de la palette (clés et ordre :
 * `convex/config/colorsConfig.ts`). Toutes les teintes suivent les mêmes
 * crans — 50 / 100 / 200 pour les fonds, 400 / 600 pour les bordures, 500 pour
 * l'accent — pour garder la même saturation et la même luminosité d'une
 * couleur à l'autre.
 *
 * `solidBg` est le fond plein qui porte un texte blanc (tuile d'un canvas) :
 * 600, ou 700 pour les teintes claires dont le 600 manquerait de contraste.
 *
 * Les classes sont écrites en entier, jamais composées : Tailwind ne génère que
 * ce qu'il lit littéralement dans le code.
 */
const colors = {
  red: {
    label: "Red",
    nodeBg: "bg-red-200",
    frameBg: "bg-red-50",
    frameBorder: "border-red-400",
    lightBg: "bg-red-100",
    nodeBorder: "border-red-600",
    accentBg: "bg-red-500",
    solidBg: "bg-red-600",
    textColor: "text-red-600",
    hoverBg: "hover:bg-red-100",
    hex: "#ef4444",
  },
  orange: {
    label: "Orange",
    nodeBg: "bg-orange-200",
    frameBg: "bg-orange-50",
    frameBorder: "border-orange-400",
    lightBg: "bg-orange-100",
    nodeBorder: "border-orange-600",
    accentBg: "bg-orange-500",
    solidBg: "bg-orange-700",
    textColor: "text-orange-600",
    hoverBg: "hover:bg-orange-100",
    hex: "#f97316",
  },
  yellow: {
    label: "Yellow",
    nodeBg: "bg-yellow-200",
    frameBg: "bg-yellow-50",
    frameBorder: "border-yellow-400",
    lightBg: "bg-yellow-100",
    nodeBorder: "border-yellow-600",
    accentBg: "bg-yellow-500",
    solidBg: "bg-yellow-700",
    textColor: "text-yellow-600",
    hoverBg: "hover:bg-yellow-100",
    hex: "#eab308",
  },
  lime: {
    label: "Lime",
    nodeBg: "bg-lime-200",
    frameBg: "bg-lime-50",
    frameBorder: "border-lime-400",
    lightBg: "bg-lime-100",
    nodeBorder: "border-lime-600",
    accentBg: "bg-lime-500",
    solidBg: "bg-lime-700",
    textColor: "text-lime-600",
    hoverBg: "hover:bg-lime-100",
    hex: "#84cc16",
  },
  green: {
    label: "Green",
    nodeBg: "bg-green-200",
    frameBg: "bg-green-50",
    frameBorder: "border-green-400",
    lightBg: "bg-green-100",
    nodeBorder: "border-green-600",
    accentBg: "bg-green-500",
    solidBg: "bg-green-700",
    textColor: "text-green-600",
    hoverBg: "hover:bg-green-100",
    hex: "#22c55e",
  },
  teal: {
    label: "Teal",
    nodeBg: "bg-teal-200",
    frameBg: "bg-teal-50",
    frameBorder: "border-teal-400",
    lightBg: "bg-teal-100",
    nodeBorder: "border-teal-600",
    accentBg: "bg-teal-500",
    solidBg: "bg-teal-700",
    textColor: "text-teal-600",
    hoverBg: "hover:bg-teal-100",
    hex: "#14b8a6",
  },
  sky: {
    label: "Sky",
    nodeBg: "bg-sky-200",
    frameBg: "bg-sky-50",
    frameBorder: "border-sky-400",
    lightBg: "bg-sky-100",
    nodeBorder: "border-sky-600",
    accentBg: "bg-sky-500",
    solidBg: "bg-sky-700",
    textColor: "text-sky-600",
    hoverBg: "hover:bg-sky-100",
    hex: "#0ea5e9",
  },
  blue: {
    label: "Blue",
    nodeBg: "bg-blue-200",
    frameBg: "bg-blue-50",
    frameBorder: "border-blue-400",
    lightBg: "bg-blue-100",
    nodeBorder: "border-blue-600",
    accentBg: "bg-blue-500",
    solidBg: "bg-blue-600",
    textColor: "text-blue-600",
    hoverBg: "hover:bg-blue-100",
    hex: "#3b82f6",
  },
  purple: {
    label: "Purple",
    nodeBg: "bg-purple-200",
    frameBg: "bg-purple-50",
    frameBorder: "border-purple-400",
    lightBg: "bg-purple-100",
    nodeBorder: "border-purple-600",
    accentBg: "bg-purple-500",
    solidBg: "bg-purple-600",
    textColor: "text-purple-600",
    hoverBg: "hover:bg-purple-100",
    hex: "#a855f7",
  },
  pink: {
    label: "Pink",
    nodeBg: "bg-pink-200",
    frameBg: "bg-pink-50",
    frameBorder: "border-pink-400",
    lightBg: "bg-pink-100",
    nodeBorder: "border-pink-600",
    accentBg: "bg-pink-500",
    solidBg: "bg-pink-700",
    textColor: "text-pink-600",
    hoverBg: "hover:bg-pink-100",
    hex: "#ec4899",
  },
  default: {
    label: "Default",
    nodeBg: "bg-white",
    frameBg: "bg-slate-50",
    frameBorder: "border-slate-400",
    lightBg: "bg-slate-50",
    nodeBorder: "border-slate-200",
    accentBg: "bg-slate-500",
    solidBg: "bg-slate-600",
    textColor: "text-slate-600",
    hoverBg: "hover:bg-slate-100",
    hex: "#94a3b8",
  },
  transparent: {
    label: "Transparent",
    nodeBg: "bg-transparent",
    frameBg: "bg-transparent",
    frameBorder: "border-transparent",
    lightBg: "bg-transparent",
    nodeBorder: "border-transparent",
    textColor: "text-slate-600",
    accentBg: "bg-transparent",
    solidBg: "bg-slate-400",
    hoverBg: "hover:bg-slate-100",
    hex: "#cbd5e1",
  },
} as const satisfies Record<
  NodeColor,
  {
    label: string;
    nodeBg: string;
    frameBg: string;
    frameBorder: string;
    lightBg: string;
    nodeBorder: string;
    accentBg: string;
    solidBg: string;
    textColor: string;
    hoverBg: string;
    hex: string;
  }
>;

export { colors };
