/**
 * Corbeille des nodes et des edges de canvas.
 *
 * Un `trash` ne détruit rien : il pose `status: "trashed"` et `trashedAt`. La
 * destruction réelle (nodeData, chunks, mémoires, blobs R2) est le travail du
 * cron `nodes.purgeTrashed`, qui ne touche que ce qui dort là depuis plus de
 * `TRASH_RETENTION_MS`. C'est ce délai qui rend une suppression annulable —
 * par l'undo du canvas dans la seconde, ou par la modale corbeille bien après.
 */

export const TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 jours

/**
 * Taille de lot du cron. Plus petit que la purge des versions (200) parce que
 * chaque node purgé planifie en plus une cascade `deleteWithCascade` : c'est
 * le nombre de fonctions schedulées par transaction qui borne ici, pas le
 * nombre de lignes lues.
 */
export const TRASH_PURGE_BATCH_SIZE = 100;
