import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";

/**
 * Diagnostic du stockage de la table `messages` (composant agent) : ce qui
 * pèse, par champ, par type de part, par tool, et ce qu'un seuil
 * d'allègement des parts de tool (cf. harness/messageTrim.ts) toucherait.
 *
 * Lancer avec : `npx convex run diagnostics:messageSizes '{}'`.
 * Lecture seule. Tailles en caractères JSON, proportionnelles au stockage.
 */

const PAGE_SIZE = 100;
const THRESHOLDS = [200, 500, 1000, 2000, 5000, 20000];

type PageStats = {
  messages: number;
  chars: number;
  byField: Record<string, number>;
  byPart: Record<string, number>;
  byTool: Record<string, { parts: number; chars: number }>;
  /** Taille de chaque part de tool (appel ou résultat), hors ask_user. */
  toolPartSizes: number[];
};

function size(value: unknown): number {
  return value === undefined ? 0 : JSON.stringify(value).length;
}

function add(record: Record<string, number>, key: string, value: number) {
  record[key] = (record[key] ?? 0) + value;
}

/** Une page de messages d'un thread, mesurée. */
export const messageSizesPage = internalQuery({
  args: { threadId: v.string(), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { threadId, cursor }) => {
    const page = await ctx.runQuery(
      components.agent.messages.listMessagesByThreadId,
      { threadId, order: "asc", paginationOpts: { cursor, numItems: PAGE_SIZE } },
    );
    const stats: PageStats = {
      messages: 0,
      chars: 0,
      byField: {},
      byPart: {},
      byTool: {},
      toolPartSizes: [],
    };
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

export const listThreadIdsPage = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db
      .query("threadMetadata")
      .paginate({ cursor, numItems: 200 });
    return {
      threadIds: page.page.map((row) => row.threadId),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

const mb = (chars: number) => Math.round((chars / 1e6) * 100) / 100;
const pct = (part: number, total: number) =>
  total === 0 ? 0 : Math.round((part / total) * 1000) / 10;

function topEntries(record: Record<string, number>, total: number, n = 10) {
  return Object.entries(record)
    .sort(([, a], [, b]) => b - a)
    .slice(0, n)
    .map(([key, chars]) => ({ key, mb: mb(chars), pct: pct(chars, total) }));
}

/**
 * Parcourt les threads (jusqu'à `maxMessages` messages au total, `maxPerThread`
 * par thread) et rend la répartition du volume.
 */
export const messageSizes = internalAction({
  args: {
    maxMessages: v.optional(v.number()),
    maxPerThread: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const maxMessages = args.maxMessages ?? 30000;
    const maxPerThread = args.maxPerThread ?? 1000;
    const total: PageStats = {
      messages: 0,
      chars: 0,
      byField: {},
      byPart: {},
      byTool: {},
      toolPartSizes: [],
    };
    let threads = 0;

    let threadCursor: string | null = null;
    scan: for (;;) {
      const threadPage: {
        threadIds: string[];
        isDone: boolean;
        continueCursor: string;
      } = await ctx.runQuery(internal.diagnostics.listThreadIdsPage, {
        cursor: threadCursor,
      });
      for (const threadId of threadPage.threadIds) {
        threads += 1;
        let cursor: string | null = null;
        let read = 0;
        while (read < maxPerThread) {
          const result: {
            stats: PageStats;
            isDone: boolean;
            continueCursor: string;
          } = await ctx.runQuery(internal.diagnostics.messageSizesPage, {
            threadId,
            cursor,
          });
          const { stats } = result;
          total.messages += stats.messages;
          total.chars += stats.chars;
          for (const [key, value] of Object.entries(stats.byField)) {
            add(total.byField, key, value);
          }
          for (const [key, value] of Object.entries(stats.byPart)) {
            add(total.byPart, key, value);
          }
          for (const [tool, entry] of Object.entries(stats.byTool)) {
            const sum = (total.byTool[tool] ??= { parts: 0, chars: 0 });
            sum.parts += entry.parts;
            sum.chars += entry.chars;
          }
          total.toolPartSizes.push(...stats.toolPartSizes);
          read += stats.messages;
          if (total.messages >= maxMessages) break scan;
          if (result.isDone) break;
          cursor = result.continueCursor;
        }
      }
      if (threadPage.isDone) break;
      threadCursor = threadPage.continueCursor;
    }

    const toolChars = total.toolPartSizes.reduce((sum, n) => sum + n, 0);
    return {
      scanned: { threads, messages: total.messages, mb: mb(total.chars) },
      // La part des champs du document : `message` (le contenu), `text`
      // (son texte, dupliqué par le composant), raisonnement, métadonnées…
      byField: topEntries(total.byField, total.chars),
      byPart: topEntries(total.byPart, total.chars),
      byTool: Object.entries(total.byTool)
        .sort(([, a], [, b]) => b.chars - a.chars)
        .slice(0, 15)
        .map(([tool, entry]) => ({
          tool,
          parts: entry.parts,
          mb: mb(entry.chars),
          pct: pct(entry.chars, total.chars),
        })),
      // Pour chaque seuil : combien de parts de tool il allégerait (donc de
      // réécritures), et quelle part du volume total il libérerait.
      thresholds: THRESHOLDS.map((threshold) => {
        const above = total.toolPartSizes.filter((n) => n >= threshold);
        const chars = above.reduce((sum, n) => sum + n, 0);
        return {
          threshold,
          parts: above.length,
          mb: mb(chars),
          pctOfAll: pct(chars, total.chars),
          pctOfToolContent: pct(chars, toolChars),
        };
      }),
    };
  },
});
