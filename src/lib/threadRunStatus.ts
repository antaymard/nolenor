import type { FunctionReturnType } from "convex/server";
import type { api } from "@/../convex/_generated/api";
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
 * Combien de temps une tâche conclue reste visible sur le canvas, ancrée aux
 * nodes qu'elle a touchés.
 *
 * Assez long pour qu'on la voie finir en revenant d'un autre coin de l'écran,
 * assez court pour que le canvas ne se couvre pas de pastilles. Passé ce délai
 * la tâche n'a pas disparu : elle est au dock, qui la garde jusqu'à la revue.
 */
export const CANVAS_AFTERGLOW_MS = 45 * 1000;

/**
 * La tâche a-t-elle sa place sur le canvas, ancrée à ses nodes ?
 *
 * Le canvas et le dock ne font pas le même métier. Le canvas montre ce qui se
 * passe **maintenant**, et où ; il se vide tout seul. Le dock est la boîte de
 * réception : il garde ce qui attend d'être relu, y compris ce que le canvas ne
 * peut pas ancrer — une tâche qui démarre n'a encore touché aucun node.
 */
export function isLiveOnCanvas(
  fields: ThreadDockFields,
  now: number = Date.now(),
): boolean {
  const resolved = resolveRunStatus(fields, now);
  if (resolved === "running") return true;
  // `stale` n'est pas « en cours » : c'est un tour que plus personne ne
  // conclura. L'ancrer indéfiniment sur le canvas en ferait du décor, alors
  // qu'il appelle une revue — le métier du dock.
  if (resolved === "stale") return false;
  if (fields.reviewedAt != null) return false;
  if (fields.runEndedAt == null) return false;
  return now - fields.runEndedAt < CANVAS_AFTERGLOW_MS;
}

/**
 * L'instant où `isLiveOnCanvas` basculera à faux tout seul, ou `null` s'il n'y a
 * rien à attendre.
 *
 * Contrairement au dock, dont l'admission ne change qu'avec les données, une
 * tâche quitte le canvas sans qu'aucune donnée ne bouge : à la péremption d'un
 * `running`, ou à la fin de sa rémanence. Sans réveil posé sur cet instant, la
 * pastille resterait jusqu'au prochain rendu fortuit.
 *
 * Lit `runStatus` brut et non le statut résolu : quand la base dit `running`,
 * la prochaine bascule est la péremption, qu'on l'ait déjà franchie ou non.
 */
export function getCanvasLiveExpiry(fields: ThreadDockFields): number | null {
  if (fields.runStatus === "running") {
    return fields.runStartedAt != null
      ? fields.runStartedAt + RUN_STALE_MS
      : null;
  }
  if (fields.reviewedAt != null) return null;
  if (fields.runEndedAt == null) return null;
  return fields.runEndedAt + CANVAS_AFTERGLOW_MS;
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

/** Une tâche telle que le dock et les marqueurs du canvas la reçoivent. */
export type PendingThread = FunctionReturnType<
  typeof api.threads.listPendingThreads
>[number];

/**
 * Ce que la pastille d'une tâche raconte, au dock comme sur le canvas.
 *
 * `lastActivity` d'abord : le titre d'un thread dit son sujet, pas où en est le
 * travail — et sur une tâche qu'on regarde justement parce qu'on ne l'a pas
 * sous les yeux, c'est l'avancement qui manque. Il tient pendant le tour comme
 * après, parce que le tool est prié d'écrire un groupe nominal et non « je vais
 * faire » (cf. `EXPLANATION_FIELD`).
 *
 * Le titre reste le repli des deux moments où il n'y a pas encore d'action à
 * montrer : le tour qui vient de démarrer, et le thread d'avant cette
 * fonctionnalité.
 */
export function getTaskPillLabel(thread: PendingThread): string {
  return thread.lastActivity?.text || thread.title || "Nolë";
}
