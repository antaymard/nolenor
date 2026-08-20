import type { ThreadRunStatus } from "@/../convex/schemas/threadMetadataSchema";

/**
 * Au-delà de ce délai, un thread encore marqué `running` est tenu pour
 * interrompu. Le serveur écrit son état terminal dans un `finally`, mais rien
 * ne s'exécute quand l'action meurt avec son conteneur : sans cette borne, la
 * pastille tournerait indéfiniment — pire que pas de statut, l'utilisateur y
 * croit.
 *
 * Généreux à dessein : un tour Nolë va jusqu'à 25 steps, dont des sous-agents.
 */
export const RUN_STALE_MS = 15 * 60 * 1000;

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
