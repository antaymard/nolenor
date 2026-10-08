import { useSyncExternalStore } from "react";
import {
  getAppUpdateStatus,
  subscribeAppUpdateStatus,
  type AppUpdateStatus,
} from "@/lib/appUpdate";

/** État de la mise à jour de l'app (cf. `src/lib/appUpdate.ts`). */
export function useAppUpdateStatus(): AppUpdateStatus {
  return useSyncExternalStore(subscribeAppUpdateStatus, getAppUpdateStatus);
}
