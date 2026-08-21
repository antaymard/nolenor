import {
  RUN_STALE_MS,
  type ThreadRunStatus,
} from "@/../convex/schemas/threadMetadataSchema";

/**
 * Réexporté depuis le schéma Convex, où il vit désormais : le serveur en a
 * besoin lui aussi, pour accepter de clore un tour périmé
 * (`threadMetadataModels.markReviewed`). Deux constantes qui divergeraient, et
 * une pastille « sans réponse » deviendrait indélogeable.
 */
export { RUN_STALE_MS };

/**
 * Ce que l'interface affiche. `stale` n'existe pas en base : c'est un
 * `running` qu'on a cessé de croire.
 */
export type ResolvedRunStatus = ThreadRunStatus | "stale";

export type ThreadRunFields = {
  runStatus: ThreadRunStatus | null | undefined;
  runStartedAt: number | null | undefined;
};

/**
 * Tranche l'état affichable d'un thread.
 *
 * La péremption se décide ici, côté client, et non dans la query : lire
 * l'horloge dans une query Convex donnerait un résultat qui ne se réévalue
 * jamais (même raison que `threads.getLatestCanvasThread`). Le serveur renvoie
 * donc `runStatus` et `runStartedAt` bruts, et l'appelant passe son `now`.
 */
export function resolveRunStatus(
  { runStatus, runStartedAt }: ThreadRunFields,
  now: number = Date.now(),
): ResolvedRunStatus {
  // Absent = thread jamais lancé : rien en cours, rien à signaler.
  if (!runStatus) return "idle";
  if (runStatus !== "running") return runStatus;
  if (runStartedAt != null && now - runStartedAt > RUN_STALE_MS) return "stale";
  return "running";
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
 * `aborted` et `stale` partagent l'ambre : dans les deux cas le tour ne s'est
 * pas terminé, sans que le modèle ait échoué. Seul le libellé les distingue.
 */
export const RUN_STATUS_APPEARANCE: Record<
  Exclude<ResolvedRunStatus, "idle">,
  RunStatusAppearance
> = {
  running: {
    label: "En cours",
    description: "Nolë travaille sur cette conversation.",
    className: "border-violet-200 bg-violet-50 text-violet-700",
    dotClassName: "bg-violet-500",
  },
  aborted: {
    label: "Interrompu",
    description: "La réponse a été interrompue.",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
  },
  stale: {
    label: "Sans réponse",
    description:
      "Ce tour n'a jamais abouti. Renvoyez votre message pour relancer.",
    className: "border-amber-200 bg-amber-50 text-amber-700",
    dotClassName: "bg-amber-500",
  },
  error: {
    label: "Échec",
    description: "La dernière réponse a échoué.",
    className: "border-red-200 bg-red-50 text-red-700",
    dotClassName: "bg-red-500",
  },
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

/**
 * Ce que le dock d'activité sait d'un thread. `runEndedAt` s'ajoute au couple
 * du statut parce que c'est lui, et non le statut résolu, qui atteste qu'un
 * tour s'est réellement conclu (cf. `isPendingReview`).
 */
export type ThreadDockFields = ThreadRunFields & {
  runEndedAt: number | null | undefined;
  reviewedAt: number | null | undefined;
};

/**
 * Le thread a-t-il sa place au dock d'activité ?
 *
 * Le dock est une boîte de réception, pas un flux d'activité récente : une
 * tâche finie y reste jusqu'à ce qu'on l'ait vue, sans TTL. C'est la revue qui
 * l'en sort, et rien d'autre.
 *
 * Le piège est `idle`. `resolveRunStatus` le rend aussi bien pour un tour qui
 * s'est bien terminé que pour un thread qui n'a jamais été lancé — d'où le
 * garde sur `runEndedAt`, sans lequel tout l'historique du canvas entrerait au
 * dock au premier chargement.
 */
export function isPendingReview(
  fields: ThreadDockFields,
  now: number = Date.now(),
): boolean {
  const resolved = resolveRunStatus(fields, now);
  // Un tour en cours ne se revoit pas : il n'est pas fini.
  if (resolved === "running") return true;
  // Un `running` qu'on a cessé de croire n'aura jamais son `runEndedAt` ; il
  // reste pourtant à revoir, c'est même la tâche qui appelle le plus l'œil.
  if (resolved === "stale") return fields.reviewedAt == null;
  // Ni lancé, ni conclu : rien à faire relire.
  if (fields.runEndedAt == null) return false;
  return fields.reviewedAt == null;
}

/**
 * L'apparence du cas que le header n'a jamais à afficher : une tâche qui a
 * abouti, et qu'il reste à relire.
 *
 * Le vert dit déjà « enregistré » dans cette app (cf. le choix des teintes
 * ci-dessus) ; « la tâche a abouti » en est le prolongement direct.
 */
const DOCK_DONE_APPEARANCE: RunStatusAppearance = {
  label: "Terminé",
  description: "Nolë a terminé cette tâche.",
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
