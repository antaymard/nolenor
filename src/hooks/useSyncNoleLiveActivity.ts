import { useEffect, useRef, useState } from "react";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import {
  activitiesFromSnapshot,
  holdActivities,
  type HeldActivity,
} from "@/lib/noleLiveActivity";
import { useNoleLiveStore } from "@/stores/noleLiveStore";

/**
 * Alimente `noleLiveStore` à partir de l'activité des runs sur le canvas (cf.
 * convex/harness/live.ts), lissée dans le temps par `holdActivities` : durée
 * minimale des halos live, fondu de sortie.
 */
export function useSyncNoleLiveActivity(
  canvasId: Id<"canvases"> | undefined,
): void {
  const { isAuthenticated } = useConvexAuth();
  const activity = useQuery(
    api.harness.live.listLiveActivity,
    canvasId && isAuthenticated ? { canvasId } : "skip",
  );
  const setActivities = useNoleLiveStore((state) => state.setActivities);
  const heldRef = useRef(new Map<string, HeldActivity>());
  // Réveil demandé par `holdActivities` : fin d'un maintien ou d'un fondu.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const { held, display, wakeAt } = holdActivities(
      heldRef.current,
      activitiesFromSnapshot(activity),
      Date.now(),
    );
    heldRef.current = held;
    setActivities(display);
    if (wakeAt === null) return;
    const timer = setTimeout(
      () => setTick((value) => value + 1),
      Math.max(0, wakeAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [activity, tick, setActivities]);

  // Le canvas change : on vide sans attendre la nouvelle réponse — les ids de
  // nodes ne sont uniques que par canvas.
  useEffect(() => {
    return () => {
      heldRef.current = new Map();
      setActivities(new Map());
    };
  }, [canvasId, setActivities]);
}
