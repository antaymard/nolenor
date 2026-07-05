"use client";

import * as React from "react";

import type { PlateLeafProps } from "platejs/react";

import { PlateLeaf } from "platejs/react";

import { cn } from "@/lib/utils";
import { colors } from "@/components/ui/styles";
import type { colorsEnum } from "@/types/domain/style.types";

export function PillLeaf(props: PlateLeafProps) {
  // Récupérer la clé de couleur depuis le mark, avec fallback vers "default"
  const colorKey = ((props.leaf.pill as colorsEnum) ||
    "default") as keyof typeof colors;
  const colorClasses = colors[colorKey] || colors.default;

  return (
    <PlateLeaf
      {...props}
      as="span"
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-sm font-medium",
        colorKey !== "default" && colorKey !== "transparent"
          ? "text-white"
          : "text-foreground",
        colorClasses.accentBg,
        // colorClasses.textColor,
        // colorClasses.nodeBorder,
      )}
    >
      {props.children}
    </PlateLeaf>
  );
}
