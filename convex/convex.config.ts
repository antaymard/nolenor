import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import debouncer from "./components/debouncer/convex.config";
import presence from "@convex-dev/presence/convex.config.js";
import prosemirrorSync from "@convex-dev/prosemirror-sync/convex.config.js";
import posthog from "@posthog/convex/convex.config.js";

const app = defineApp();
app.use(agent);
app.use(rateLimiter);
app.use(debouncer);
app.use(presence);
app.use(prosemirrorSync);
// Même projet et même hôte que le front (cf. src/lib/analytics.ts) : le token
// projet est public par design. Valeurs en dur plutôt que liées à des env vars
// du déploiement : Convex refuse de lier une variable optionnelle de l'app à
// une variable obligatoire du composant, et la rendre obligatoire bloquerait
// le déploiement de chaque dev, preview ou fork qui ne la pose pas. Ce qui
// part réellement est décidé par `lib/observability.ts` (prod uniquement).
// Pas de `POSTHOG_PERSONAL_API_KEY` : seule l'évaluation locale des feature
// flags en a besoin, et le backend n'en lit pas.
app.use(posthog, {
  env: {
    POSTHOG_PROJECT_TOKEN: "phc_nHUW2KSJs6rATYgiQWyMJ9zyGHTRdSn5R7yxTUnvy6tK",
    POSTHOG_HOST: "https://pt.nolenor.fr",
  },
});

export default app;
