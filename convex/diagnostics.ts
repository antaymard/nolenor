import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";

/**
 * Diagnostic du stockage de la table `messages` (composant agent) : ce qui
 * pèse, par champ, par type de part, par tool, et ce qu'un seuil
 * d'allègement des parts de tool (cf. harness/messageTrim.ts) toucherait.
 *
 * Parcourt les threads du composant, utilisateur par utilisateur — pas
 * `threadMetadata` : un thread sans ligne chez nous (d'avant la table,
 * orphelin) est invisible dans l'app mais pèse quand même. Ceux-là sont
 * comptés à part.
 *
 * Lancer avec : `npx convex run diagnostics:messageSizes '{}'`.
 * Lecture seule. Tailles en caractères JSON, proportionnelles au stockage.
 */

const PAGE_SIZE = 100;
const THRESHOLDS = [500, 2000, 5000, 20000];

type Stats = {
  messages: number;
  chars: number;
  byField: Record<string, number>;
  byPart: Record<string, number>;
  byTool: Record<string, { parts: number; chars: number }>;
  /** Taille de chaque part de tool (appel ou résultat). */
  toolPartSizes: number[];
};

function emptyStats(): Stats {
  return {
    messages: 0,
    chars: 0,
    byField: {},
    byPart: {},
    byTool: {},
    toolPartSizes: [],
  };
}

function size(value: unknown): number {
  return value === undefined ? 0 : JSON.stringify(value).length;
}

function add(record: Record<string, number>, key: string, value: number) {
  record[key] = (record[key] ?? 0) + value;
}

function merge(into: Stats, from: Stats) {
  into.messages += from.messages;
  into.chars += from.chars;
  for (const [key, value] of Object.entries(from.byField)) {
    add(into.byField, key, value);
  }
  for (const [key, value] of Object.entries(from.byPart)) {
    add(into.byPart, key, value);
  }
  for (const [tool, entry] of Object.entries(from.byTool)) {
    const sum = (into.byTool[tool] ??= { parts: 0, chars: 0 });
    sum.parts += entry.parts;
    sum.chars += entry.chars;
  }
  into.toolPartSizes.push(...from.toolPartSizes);
}

/** Une page de messages d'un thread, mesurée. */
export const messageSizesPage = internalQuery({
  args: { threadId: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { threadId, cursor }) => {
    const page = await ctx.runQuery(
      components.agent.messages.listMessagesByThreadId,
      { threadId, order: "asc", paginationOpts: { cursor, numItems: PAGE_SIZE } },
    );
    const stats = emptyStats();
    for (const doc of page.page) {
      stats.messages += 1;
      stats.chars += size(doc);
      for (const [field, value] of Object.entries(doc)) {
        add(stats.byField, field, size(value));
      }
      const content = doc.message?.content;
      if (!Array.isArray(content)) {
        add(stats.byPart, "plain", size(content));
        continue;
      }
      for (const part of content as { type: string; toolName?: string }[]) {
        const partChars = size(part);
        add(stats.byPart, part.type, partChars);
        if (part.type !== "tool-call" && part.type !== "tool-result") continue;
        const tool = part.toolName ?? "?";
        const entry = (stats.byTool[tool] ??= { parts: 0, chars: 0 });
        entry.parts += 1;
        entry.chars += partChars;
        stats.toolPartSizes.push(partChars);
      }
    }
    return { stats, isDone: page.isDone, continueCursor: page.continueCursor };
  },
});

export const listUserIdsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("users").paginate({ cursor, numItems: 100 });
    return {
      userIds: page.page.map((user) => user._id as string),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/** Ceux de ces threads qui ont une ligne `threadMetadata`. */
export const trackedThreadIds = internalQuery({
  args: { threadIds: v.array(v.string()) },
  handler: async (ctx, { threadIds }) => {
    const tracked: string[] = [];
    for (const threadId of threadIds) {
      const row = await ctx.db
        .query("threadMetadata")
        .withIndex("by_threadId", (q) => q.eq("threadId", threadId))
        .unique();
      if (row) tracked.push(threadId);
    }
    return tracked;
  },
});

const mb = (chars: number) => Math.round((chars / 1e6) * 100) / 100;
const pct = (part: number, total: number) =>
  total === 0 ? 0 : Math.round((part / total) * 1000) / 10;

function topEntries(record: Record<string, number>, total: number, n = 8) {
  return Object.entries(record)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([key, chars]) => ({ key, mb: mb(chars), pct: pct(chars, total) }));
}

type ThreadPage = {
  page: { _id: string; _creationTime: number }[];
  isDone: boolean;
  continueCursor: string;
};

/**
 * Parcourt les threads du composant (jusqu'à `maxMessages` messages au
 * total, `maxPerThread` par thread) et rend la répartition du volume.
 */
export const messageSizes = internalAction({
  args: {
    maxMessages: v.optional(v.number()),
    maxPerThread: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxMessages = args.maxMessages ?? 60000;
    const maxPerThread = args.maxPerThread ?? 5000;
    const all = emptyStats();
    const orphans = emptyStats();
    let threads = 0;
    let orphanThreads = 0;
    let truncatedThreads = 0;
    let oldestOrphan: number | null = null;
    let newestOrphan: number | null = null;

    // Les threads d'un utilisateur, puis ceux sans utilisateur.
    const owners: (string | undefined)[] = [];
    let userCursor: string | null = null;
    for (;;) {
      const users: { userIds: string[]; isDone: boolean; continueCursor: string } =
        await ctx.runQuery(internal.diagnostics.listUserIdsPage, {
          cursor: userCursor,
        });
      owners.push(...users.userIds);
      if (users.isDone) break;
      userCursor = users.continueCursor;
    }
    owners.push(undefined);

    scan: for (const userId of owners) {
      let threadCursor: string | null = null;
      for (;;) {
        const threadPage: ThreadPage = await ctx.runQuery(
          components.agent.threads.listThreadsByUserId,
          {
            ...(userId !== undefined ? { userId } : {}),
            order: "asc",
            paginationOpts: { cursor: threadCursor, numItems: 100 },
          },
        );
        const tracked = new Set<string>(
          await ctx.runQuery(internal.diagnostics.trackedThreadIds, {
            threadIds: threadPage.page.map((thread) => thread._id),
          }),
        );
        for (const thread of threadPage.page) {
          threads += 1;
          const isOrphan = !tracked.has(thread._id);
          if (isOrphan) {
            orphanThreads += 1;
            oldestOrphan = Math.min(oldestOrphan ?? Infinity, thread._creationTime);
            newestOrphan = Math.max(newestOrphan ?? 0, thread._creationTime);
          }
          let cursor: string | null = null;
          let read = 0;
          for (;;) {
            const result: { stats: Stats; isDone: boolean; continueCursor: string } =
              await ctx.runQuery(internal.diagnostics.messageSizesPage, {
                threadId: thread._id,
                cursor,
              });
            merge(all, result.stats);
            if (isOrphan) merge(orphans, result.stats);
            read += result.stats.messages;
            if (all.messages >= maxMessages) break scan;
            if (result.isDone) break;
            if (read >= maxPerThread) {
              truncatedThreads += 1;
              break;
            }
            cursor = result.continueCursor;
          }
        }
        if (threadPage.isDone) break;
        threadCursor = threadPage.continueCursor;
      }
    }

    const toolChars = all.toolPartSizes.reduce((sum, n) => sum + n, 0);
    const day = (time: number | null) =>
      time === null ? null : new Date(time).toISOString().slice(0, 10);
    return {
      scanned: {
        threads,
        messages: all.messages,
        mb: mb(all.chars),
        // Bornes atteintes : le scan n'a pas tout vu.
        complete: all.messages < maxMessages && truncatedThreads === 0,
        truncatedThreads,
      },
      // Threads du composant sans ligne `threadMetadata` : invisibles dans
      // l'app (tous les listings partent de cette table).
      orphans: {
        threads: orphanThreads,
        messages: orphans.messages,
        mb: mb(orphans.chars),
        pctOfAll: pct(orphans.chars, all.chars),
        created: { from: day(oldestOrphan), to: day(newestOrphan) },
      },
      byField: topEntries(all.byField, all.chars),
      byPart: topEntries(all.byPart, all.chars),
      byTool: Object.entries(all.byTool)
        .sort(([, a], [, b]) => b.chars - a.chars)
        .slice(0, 10)
        .map(([tool, entry]) => ({
          tool,
          parts: entry.parts,
          mb: mb(entry.chars),
          pct: pct(entry.chars, all.chars),
        })),
      // Pour chaque seuil : combien de parts de tool il allégerait (donc de
      // réécritures), et quelle part du volume total il libérerait.
      thresholds: THRESHOLDS.map((threshold) => {
        const above = all.toolPartSizes.filter((n) => n >= threshold);
        const chars = above.reduce((sum, n) => sum + n, 0);
        return {
          threshold,
          parts: above.length,
          mb: mb(chars),
          pctOfAll: pct(chars, all.chars),
          pctOfToolContent: pct(chars, toolChars),
        };
      }),
    };
  },
});
