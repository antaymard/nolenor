import type { NoleNodeActivity } from "@/stores/noleLiveStore";

/**
 * Ce que la query `harness.live.listLiveActivity` renvoie, réduit à ce que le
 * canvas en lit.
 */
export type LiveActivitySnapshot = {
  calls: {
    access: "read" | "write";
    toolName: string;
    explanation: string | null;
    nodeIds: string[];
  }[];
  written: { nodeId: string }[];
  done: {
    nodeId: string;
    access: "read" | "write";
    toolName: string | null;
    label: string | null;
  }[];
};

/** Un halo live reste au moins ce temps, même si l'appel est plus court. */
export const MIN_LIVE_MS = 1500;
/** Durée du fondu de sortie (cf. les transitions de `NodeFrame`). */
export const FADE_MS = 600;

const RANK: Record<NoleNodeActivity["access"], number> = {
  write: 3,
  read: 2,
  written: 1,
  seen: 0,
};

export function isLiveAccess(access: NoleNodeActivity["access"]): boolean {
  return access === "read" || access === "write";
}

/**
 * L'état de chaque node d'après la query, sans notion de temps. Le plus fort
 * l'emporte : écriture en cours, lecture en cours, déjà écrit, déjà lu. Hors
 * appel en cours, l'étiquette est celle du dernier appel terminé sur le node.
 */
export function activitiesFromSnapshot(
  snapshot: LiveActivitySnapshot | undefined,
): Map<string, NoleNodeActivity> {
  const byNodeId = new Map<string, NoleNodeActivity>();
  const offer = (nodeId: string, next: NoleNodeActivity) => {
    const existing = byNodeId.get(nodeId);
    if (existing && RANK[existing.access] >= RANK[next.access]) return;
    byNodeId.set(nodeId, next);
  };
  if (!snapshot) return byNodeId;

  const lastDone = new Map<string, LiveActivitySnapshot["done"][number]>();
  for (const done of snapshot.done) lastDone.set(done.nodeId, done);

  for (const call of snapshot.calls) {
    for (const nodeId of call.nodeIds) {
      offer(nodeId, {
        access: call.access,
        toolName: call.toolName,
        label: call.explanation,
      });
    }
  }
  for (const { nodeId } of snapshot.written) {
    const done = lastDone.get(nodeId);
    offer(nodeId, {
      access: "written",
      toolName: done?.toolName ?? null,
      label: done?.label ?? null,
    });
  }
  for (const done of snapshot.done) {
    offer(done.nodeId, {
      access: done.access === "write" ? "written" : "seen",
      toolName: done.toolName,
      label: done.label,
    });
  }
  return byNodeId;
}

/** Ce qui est affiché pour un node, et jusqu'à quand il tient. */
export type HeldActivity = {
  shown: NoleNodeActivity;
  /** Activité live : affichée au moins jusque-là. */
  holdUntil?: number;
  /** En train de disparaître : retiré à cette date. */
  leavingUntil?: number;
};

function sameShown(a: NoleNodeActivity, b: NoleNodeActivity): boolean {
  return (
    a.access === b.access && a.label === b.label && a.toolName === b.toolName
  );
}

/**
 * Lisse l'état brut dans le temps, pour que l'activité de Nolë se lise :
 * - un halo live tient au moins `MIN_LIVE_MS`, une lecture de 100 ms comprise ;
 *   seul un nouvel appel live sur le node le remplace plus tôt ;
 * - un node qui sort de l'activité (fin du run) part en fondu pendant
 *   `FADE_MS` au lieu de s'éteindre d'un coup.
 *
 * Pure : le hook rappelle avec `now` à la date `wakeAt` renvoyée.
 */
export function holdActivities(
  previous: ReadonlyMap<string, HeldActivity>,
  incoming: ReadonlyMap<string, NoleNodeActivity>,
  now: number,
): {
  held: Map<string, HeldActivity>;
  display: Map<string, NoleNodeActivity>;
  wakeAt: number | null;
} {
  const held = new Map<string, HeldActivity>();
  const nodeIds = new Set([...previous.keys(), ...incoming.keys()]);

  for (const nodeId of nodeIds) {
    const next = incoming.get(nodeId);
    const prev = previous.get(nodeId);
    const prevHeld =
      prev !== undefined &&
      prev.leavingUntil === undefined &&
      isLiveAccess(prev.shown.access) &&
      (prev.holdUntil ?? 0) > now;

    if (next && isLiveAccess(next.access)) {
      held.set(
        nodeId,
        prev && prev.leavingUntil === undefined && sameShown(prev.shown, next)
          ? prev
          : { shown: next, holdUntil: now + MIN_LIVE_MS },
      );
    } else if (prevHeld) {
      held.set(nodeId, prev);
    } else if (next) {
      held.set(nodeId, { shown: next });
    } else if (prev) {
      if (prev.leavingUntil === undefined) {
        held.set(nodeId, { shown: prev.shown, leavingUntil: now + FADE_MS });
      } else if (prev.leavingUntil > now) {
        held.set(nodeId, prev);
      }
    }
  }

  const display = new Map<string, NoleNodeActivity>();
  let wakeAt: number | null = null;
  const wake = (at: number | undefined) => {
    if (at !== undefined && at > now && (wakeAt === null || at < wakeAt)) {
      wakeAt = at;
    }
  };
  for (const [nodeId, entry] of held) {
    display.set(
      nodeId,
      entry.leavingUntil === undefined
        ? entry.shown
        : { ...entry.shown, leaving: true },
    );
    wake(entry.holdUntil);
    wake(entry.leavingUntil);
  }
  return { held, display, wakeAt };
}
