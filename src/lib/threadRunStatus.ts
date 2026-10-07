import type { FunctionReturnType } from "convex/server";
import type { api } from "@/../convex/_generated/api";
import type { ThreadRunStatus } from "@/../convex/schemas/threadMetadataSchema";

/** Ce que l'interface affiche : le statut d'un run, tel quel. */
export type ResolvedRunStatus = ThreadRunStatus;

export type ThreadRunFields = {
  runStatus: ThreadRunStatus | null | undefined;
};

/**
 * Le statut affichable d'un thread ou d'une tâche. Absent = thread jamais
 * lancé : rien en cours, rien à signaler.
 *
 * Pas de péremption : la harness conclut toujours un run (au besoin par le
 * cron de reprise), et le serveur rend déjà l'état d'un thread déduit de son
 * run en cours ou du dernier (cf. `runModels.threadRunState`).
 */
export function resolveRunStatus({ runStatus }: ThreadRunFields): ResolvedRunStatus {
  return runStatus ?? "idle";
}

export type RunStatusAppearance = {
  /** Tenu court : la pastille partage un header étroit avec quatre boutons. */
  label: string;
  /** Phrase complète, au survol — là où la place ne manque pas. */
  description: string;
  /** Classes de la pastille : fond, texte, bordure. */
  className: string;
  /** Teinte du point. */
  dotClassName: string;
};

/**
 * Vocabulaire visuel des statuts, partagé par le header de conversation et la
 * liste de threads.
 *
 * Les teintes esquivent celles déjà porteuses de sens ailleurs dans l'app :
 * le bleu dit « node sélectionné », le vert « enregistré ». Le violet, lui,
 * dit déjà « Nolë » (l'anneau pointillé d'un node attaché) — l'étendre au
 * travail en cours prolonge un sens appris plutôt que d'en inventer un.
 *
 * `aborted` est ambre : le tour ne s'est pas terminé, sans que le modèle ait
 * échoué.
 */
export const RUN_STATUS_APPEARANCE: Record<
  Exclude<ResolvedRunStatus, "idle">,
  RunStatusAppearance
> = {
  running: {
    label: "In progress",
    description: "Nolë is working on this conversation.",
    className: "border-violet-200 bg-violet-50 text-violet-700",
    dotClassName: "bg-violet-500",
  },
  // Le violet de Nolë, sans pulsation : le travail est suspendu, et c'est à
  // l'utilisateur de le relancer.
  waiting: {
    label: "Needs your answer",
    description: "Nolë asked you a question and is waiting for your answer.",
    className: "border-violet-300 bg-white text-violet-700",
    dotClassName: "bg-violet-500",
  },
  aborted: {
    label: "Interrupted",
    description: "The response was interrupted.",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
  },
  error: {
    label: "Failed",
    description: "The last response failed.",
    className: "border-red-200 bg-red-50 text-red-700",
    dotClassName: "bg-red-500",
  },
};

/**
 * La bordure d'un bloc de tâche, par statut.
 *
 * Vit ici plutôt que dans `TaskCard` depuis que la home affiche elle aussi des
 * tâches : le dock et la home doivent se teinter de la même façon, et deux
 * tables qui divergent, c'est un même « terminé » vert d'un côté, émeraude de
 * l'autre.
 *
 * Le bloc reste blanc quel que soit son état, seule sa bordure prend la teinte
 * (cf. `TaskCard` : un fond coloré noyait le halo du run et rendait un dock de
 * trois blocs très bruyant).
 */
export const RUN_STATUS_BORDER: Record<ResolvedRunStatus, string> = {
  running: "border-violet-200",
  waiting: "border-violet-400",
  idle: "border-emerald-200",
  error: "border-red-200",
  aborted: "border-amber-200",
};

/**
 * `idle` n'a pas d'apparence : l'absence de pastille dit « rien en cours »
 * mieux qu'une pastille grise permanente, qui deviendrait du bruit.
 */
export function getRunStatusAppearance(
  status: ResolvedRunStatus,
): RunStatusAppearance | null {
  return status === "idle" ? null : RUN_STATUS_APPEARANCE[status];
}

/** Les dates d'un run, pour le dater et mesurer sa durée. */
export type ThreadDockFields = ThreadRunFields & {
  runStartedAt: number | null | undefined;
  runEndedAt: number | null | undefined;
};

/**
 * L'apparence du cas que le header n'a jamais à afficher : une tâche qui a
 * abouti, et qu'il reste à relire.
 *
 * Le vert dit déjà « enregistré » dans cette app (cf. le choix des teintes
 * ci-dessus) ; « la tâche a abouti » en est le prolongement direct.
 */
const DOCK_DONE_APPEARANCE: RunStatusAppearance = {
  label: "Finished",
  description: "Nolë has finished this task.",
  className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  dotClassName: "bg-emerald-500",
};

/**
 * Comme `getRunStatusAppearance`, mais ne rend jamais `null` : au dock, `idle`
 * est le cas le plus fréquent — « terminé, pas encore revu » — et non un état
 * de repos qu'il faudrait taire. Les quatre autres gardent leur apparence
 * partagée : le dock, le header et la liste disent la même chose de la même
 * couleur.
 */
export function getDockStatusAppearance(
  status: ResolvedRunStatus,
): RunStatusAppearance {
  return status === "idle"
    ? DOCK_DONE_APPEARANCE
    : RUN_STATUS_APPEARANCE[status];
}

/**
 * Une tâche telle que le dock la reçoit : un run, avec la demande qui l'a
 * ouvert (cf. convex/runs.ts). Le thread n'en est que le contexte.
 */
export type PendingTask = FunctionReturnType<
  typeof api.runs.listPendingRuns
>[number];

/**
 * Une tâche telle que la home la reçoit : rattachée à son canvas, et sans le
 * détail des nodes touchés — hors d'un canvas ouvert, leurs titres sont
 * inaccessibles (cf. `runs.listPendingRunsForUser`).
 */
export type HomePendingTask = FunctionReturnType<
  typeof api.runs.listPendingRunsForUser
>[number];

/**
 * Ordre d'urgence des statuts : ce qui a besoin de l'utilisateur d'abord.
 *
 * Sert là où plusieurs tâches doivent tenir en un seul signe — la pastille de
 * carte, sur la home. Un échec l'emporte sur le reste : c'est la seule tâche
 * qui demande une décision. Le travail en cours vient après ce qui a mal
 * tourné, mais avant ce qui s'est bien passé : il est vivant, on peut aller le
 * regarder.
 */
const RUN_STATUS_URGENCY: Record<ResolvedRunStatus, number> = {
  error: 4,
  // Une question bloque le travail jusqu'à la réponse : aussi pressant qu'un
  // tour qui n'a pas abouti.
  waiting: 3,
  aborted: 3,
  running: 2,
  idle: 1,
};

/**
 * Le rang d'urgence d'un statut, pour trier une liste de tâches — la home met
 * en tête ce qui a besoin de l'utilisateur.
 */
export function runStatusUrgency(status: ResolvedRunStatus): number {
  return RUN_STATUS_URGENCY[status];
}

/**
 * Le statut qui parle pour tout un lot de tâches : le plus urgent d'entre eux.
 *
 * `idle` quand le lot est vide — l'appelant n'affiche alors rien, et n'a pas à
 * démêler un `null` de plus.
 */
export function pickDominantRunStatus(
  statuses: readonly ResolvedRunStatus[],
): ResolvedRunStatus {
  return statuses.reduce<ResolvedRunStatus>(
    (worst, status) =>
      RUN_STATUS_URGENCY[status] > RUN_STATUS_URGENCY[worst] ? status : worst,
    "idle",
  );
}

/**
 * L'instant que la home date : la fin du tour, ou son départ à défaut.
 *
 * Un tour en cours n'a pas encore de fin : le dater par son départ vaut mieux
 * que de ne pas le dater.
 */
export function runTimeAnchor(fields: ThreadDockFields): number | null {
  return fields.runEndedAt ?? fields.runStartedAt ?? null;
}

/**
 * La durée d'un tour, en une poignée de caractères.
 *
 * Le bloc lui réserve un coin, pas une colonne : la précision au-delà de la
 * minute n'apprendrait rien qu'on ne lise déjà dans l'ordre du dock.
 */
export function formatRunDuration(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  return `${Math.floor(minutes / 60)}h`;
}
