import { ConvexError } from "convex/values";
import toast from "react-hot-toast";
import { reportError } from "@/lib/analytics";

export function toastError(error: unknown, defaultMessage: string) {
  // `reportError` logge en console et remonte à PostHog : c'est le seul chemin
  // de capture de l'app (cf. src/lib/analytics.ts).
  reportError(error, { source: "toastError", defaultMessage });

  let errorMessage = defaultMessage;

  if (error instanceof ConvexError) {
    // ConvexError stocke le message dans .data
    errorMessage =
      typeof error.data === "string" ? error.data : JSON.stringify(error.data);
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  toast.error(errorMessage);
}
