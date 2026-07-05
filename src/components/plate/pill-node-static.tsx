"use client";

import * as React from "react";

import type { SlateLeafProps } from "platejs/static";

import { SlateLeaf } from "platejs/static";

import { cn } from "@/lib/utils";
import { colors } from "@/components/ui/styles";
import type { colorsEnum } from "@/types/domain/style.types";

export function PillLeafStatic(props: SlateLeafProps) {
  // Récupérer la clé de couleur depuis le mark, avec fallback vers "default"
  const colorKey = ((props.leaf.pill as colorsEnum) ||
    "default") as keyof typeof colors;
  const colorClasses = colors[colorKey] || colors.default;

  return (
    <SlateLeaf
      {...props}
      as="span"
      className={cn(
        "inline-flex items-center rounded-sm px-2 py-0.5 text-sm font-medium",
        colorKey !== "default" && colorKey !== "transparent"
          ? "text-white"
          : "text-foreground",
        colorClasses.accentBg,
        // colorClasses.textColor,
        // colorClasses.nodeBorder,
      )}
    >
      {props.children}
    </SlateLeaf>
  );
}
