"use client";

import * as React from "react";

export type DeviceType = "mobile" | "tablet" | "desktop";

/**
 * Détecte le type d'appareil : mobile (smartphone), tablet ou desktop
 * Utilise le user agent pour une détection fiable du type d'appareil
 */
export function useDeviceType(): DeviceType {
  const [deviceType, setDeviceType] = React.useState<DeviceType>(() => {
    if (typeof window === "undefined") return "desktop";
    return getDeviceType();
  });

  React.useEffect(() => {
    setDeviceType(getDeviceType());
  }, []);

  return deviceType;
}

export function getDeviceType(): DeviceType {
  if (typeof navigator === "undefined") return "desktop";

  const userAgent =
    navigator.userAgent ||
    navigator.vendor ||
    (window as Window & { opera?: string }).opera ||
    "";
  const ua = userAgent.toLowerCase();

  // Détection des tablettes
  const isTablet =
    /(ipad|tablet|(android(?!.*mobile))|(windows(?!.*phone)(.*touch))|kindle|playbook|silk|(puffin(?!.*(IP|AP|WP))))/.test(
      ua
    );

  if (isTablet) return "tablet";

  // Détection des smartphones
  const isMobile =
    /android.*mobile|iphone|ipod|blackberry|iemobile|opera mini|windows phone|mobile/.test(
      ua
    );

  // Vérifie aussi via userAgentData si disponible (API moderne)
  const userAgentData = (
    navigator as Navigator & { userAgentData?: { mobile?: boolean } }
  ).userAgentData;
  if (userAgentData?.mobile !== undefined) {
    if (userAgentData.mobile) return "mobile";
  }

  if (isMobile) return "mobile";

  return "desktop";
}
