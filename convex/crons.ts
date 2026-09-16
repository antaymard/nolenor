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

// Corbeille du canvas : les nodes et edges mis à la corbeille depuis plus de
// TRASH_RETENTION_MS (cf. config/trashConfig) sont réellement détruits. C'est
// ce délai qui rend une suppression annulable — par l'undo dans la seconde,
// par la modale corbeille bien après. Les deux passes sont espacées pour ne
// pas empiler leurs cascades sur le même créneau.
crons.daily(
  "purge trashed canvas nodes",
  { hourUTC: 4, minuteUTC: 30 },
  internal.nodes.purgeTrashed,
  {},
);

crons.daily(
  "purge trashed canvas edges",
  { hourUTC: 4, minuteUTC: 45 },
  internal.edges.purgeTrashed,
  {},
);

// Filet des sous-agents. Deux passes : ramasser les tâches dont l'action est
// morte avec son conteneur (aucun `finally` ne s'exécute alors), puis remettre
// les rapports qu'aucun des deux chemins normaux n'a pu livrer. Sans ce
// balayage, une seule tâche perdue bloque son lot POUR TOUJOURS et la
// conversation attend un rapport qui ne viendra pas.
//
// Cinq minutes : c'est le délai maximal d'un rattrapage, pas la cadence
// normale de la délégation, qui livre elle-même en temps réel.
crons.interval(
  "recover stranded subagents",
  { minutes: 5 },
  internal.ia.subAgents.recoverSubAgents,
  {},
);

export default crons;
