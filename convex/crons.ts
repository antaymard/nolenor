import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Rétention du versioning des nodeDatas : purge quotidienne des snapshots
// au-delà du TTL (cf. VERSION_RETENTION_MS dans nodeDataVersionModels).
crons.daily(
  "prune expired nodeData versions",
  { hourUTC: 4, minuteUTC: 0 },
  internal.nodeDataVersions.pruneExpired,
  {},
);

// Rétention du ledger d'usage IA : purge des événements au-delà du TTL (cf.
// AI_USAGE_EVENTS_RETENTION_MS dans aiUsageModels). Le rollup journalier n'est
// jamais purgé.
crons.daily(
  "prune expired ai usage events",
  { hourUTC: 4, minuteUTC: 15 },
  internal.aiUsage.pruneExpiredEvents,
  {},
);

export default crons;
