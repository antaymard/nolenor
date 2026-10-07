import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import debouncer from "./components/debouncer/convex.config";
import presence from "@convex-dev/presence/convex.config.js";

const app = defineApp();
app.use(agent);
app.use(rateLimiter);
app.use(debouncer);
app.use(presence);

export default app;
