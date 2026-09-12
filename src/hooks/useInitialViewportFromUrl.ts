import { useCallback, useEffect, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import type { Viewport } from "@xyflow/react";
import { applyFraming, framingFromParam } from "@/lib/canvasViewportFraming";

/**
 * Ouvre le canvas sur le cadrage porté par l'URL (`?v=cx,cy,zoom`).
 *
 * Le param est déclaré sur la route canvas (cf. `routes/canvas/$canvasId.tsx`),
 * produit par le bouton « Copy link to this view » de `SharingModal`, et lu ici
 * une seule fois, au montage.
 *
 * À appeler depuis un composant sous le `ReactFlowProvider`.
 */

/**
 * Le strict minimum dont on a besoin de l'instance React Flow — même forme que
 * le paramètre de `applyFraming`, pour ne pas traîner les génériques de
 * `ReactFlowInstance` jusqu'ici.
 */
type ViewportSetter = {
  setViewport: (viewport: Viewport, options?: { duration?: number }) => void;
};

/** Délai au-delà duquel on révèle le canvas même si `onInit` n'est jamais venu. */
const REVEAL_FALLBACK_MS = 1000;

export function useInitialViewportFromUrl(): {
  /** À brancher sur `<ReactFlow onInit>`. */
  onFlowInit: (instance: ViewportSetter) => void;
  /**
   * Vrai tant qu'un cadrage venu de l'URL n'a pas été posé : le flow doit
   * rester invisible, voir plus bas.
   */
  isPending: boolean;
} {
  // `select` borne l'abonnement au seul `v` : sans lui, chaque ouverture de
  // l'éditeur de template (`?template=`, déclaré sur la racine) re-rendrait
  // tout le canvas — même raison que `useTemplateEditor`.
  const param = useSearch({
    strict: false,
    select: (search) => (search as { v?: string }).v,
  });

  // Figé au montage, volontairement. Le param reste dans l'URL après le load :
  // un `navigate({ to: "." })` ultérieur le conserve (ouverture de l'éditeur de
  // template depuis le canvas), et suivre sa valeur ramènerait la vue en
  // arrière alors que l'utilisateur a déjà navigué ailleurs.
  const [framing] = useState(() => framingFromParam(param));

  // React Flow mesure son pane et crée son panZoom dans des effets, donc
  // `onInit` n'arrive qu'après une première peinture : une frame part au
  // `defaultViewport` avant de sauter à la cible. Mesuré sur un banc React Flow
  // isolé (Chromium, `onInit` à la 3e frame) : sans ce masque, 6 chargements sur
  // 8 peignent bien cette frame parasite. On ne masque que quand l'URL porte un
  // cadrage — sans URL positionnée, rien ne change du comportement d'avant.
  const [isPending, setIsPending] = useState(framing !== null);

  const onFlowInit = useCallback(
    (instance: ViewportSetter) => {
      // `duration: 0` : on *arrive* à destination. Animer depuis un viewport
      // par défaut que personne n'a vu ne serait qu'un artefact.
      if (framing) applyFraming(framing, instance.setViewport, 0);
      setIsPending(false);
    },
    [framing],
  );

  // Garde-fou : un canvas resté invisible serait un bug bien pire que la frame
  // de saut qu'on cherche à masquer.
  useEffect(() => {
    if (!isPending) return;
    const timer = setTimeout(() => setIsPending(false), REVEAL_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [isPending]);

  return { onFlowInit, isPending };
}
