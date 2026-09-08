import { defineApp } from "convex/server";
import agent from "@convex-dev/agent/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config.js";
import migrations from "@convex-dev/migrations/convex.config";

const app = defineApp();
app.use(agent);
app.use(rateLimiter);
app.use(migrations);

export default app;
