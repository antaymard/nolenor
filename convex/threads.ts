import {
  action,
  internalAction,
  mutation,
  query,
  type ActionCtx,
  type QueryCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { requireAuth, requireCanvasAccess } from "./lib/auth";
import { components, internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import { paginationOptsValidator } from "convex/server";
import {
  createThread,
  getThreadMetadata,
  listUIMessages,
  syncStreams,
  vStreamArgs,
} from "@convex-dev/agent";
import z from "zod";
import { createBaseAgent } from "./ia/agents";
import errors from "./config/errorsConfig";
import { threadAgentNames } from "./schemas/threadMetadataSchema";
import { abortRun } from "./harness/tasks";
import * as RunModels from "./models/runModels";
import { aiUsageSources } from "./schemas/aiUsageSourceSchema";
import {
  findByThreadId,
  lastActivityTime,
  listNoleThreadsByUserAndCanvas,
} from "./models/threadMetadataModels";
import { threadRunStatusValidator } from "./schemas/threadMetadataSchema";

// Bornes de scan. Le nombre de conversations Nolë par canvas et par
// utilisateur reste petit ; on lit une tranche récente et on trie en mémoire
// sur la dernière activité (que l'index, ordonné par date de création, ne
// donne pas).
const LATEST_THREAD_SCAN_LIMIT = 20;
const CANVAS_THREADS_SCAN_LIMIT = 30;
function byLastActivityDesc(a: Doc<"threadMetadata">, b: Doc<"threadMetadata">) {
  return lastActivityTime(b) - lastActivityTime(a);
}

/**
 * Les conversations Nolë d'un canvas, la plus récemment active d'abord,
 * hydratées de leur titre auprès du composant agent puis projetées.
 */
async function loadNoleThreads<T>(
  ctx: QueryCtx,
  {
    canvasId,
    project,
  }: {
    canvasId: Id<"canvases">;
    project: (
      metadata: Doc<"threadMetadata">,
      title: string | null,
    ) => T | Promise<T>;
  },
): Promise<T[]> {
  const authUserId = await requireAuth(ctx);
  await requireCanvasAccess(ctx, canvasId, authUserId, "viewer");

  const threads = (
    await listNoleThreadsByUserAndCanvas(ctx, {
      userId: authUserId,
      canvasId,
      limit: CANVAS_THREADS_SCAN_LIMIT,
    })
  ).sort(byLastActivityDesc);

  const hydrated = await Promise.all(
    threads.map(async (metadata) => {
      const thread = await getThreadMetadata(ctx, components.agent, {
        threadId: metadata.threadId,
      }).catch(() => null);
      // La ligne survit à la suppression du thread côté composant si le
      // nettoyage a échoué : on l'ignore plutôt que d'afficher un fantôme.
      if (!thread) return null;
      return project(metadata, thread.title ?? null);
    }),
  );
  return hydrated.filter((row) => row !== null);
}

/**
 * Dernière conversation Nolë de l'utilisateur sur ce canvas, avec la date de sa
 * dernière activité. C'est l'appelant qui décide s'il la reprend ou s'il
 * démarre une conversation vierge : la fenêtre de reprise dépend de l'heure
 * courante, et lire l'horloge dans une query donnerait un résultat qui ne se
 * réévalue jamais.
 */
export const getLatestCanvasThread = query({
  args: {
    canvasId: v.id("canvases"),
  },
  returns: v.union(
    v.object({
      threadId: v.string(),
      lastActivityTime: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, { canvasId }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, authUserId, "viewer");

    const threads = await listNoleThreadsByUserAndCanvas(ctx, {
      userId: authUserId,
      canvasId,
      limit: LATEST_THREAD_SCAN_LIMIT,
    });

    const latest = threads.sort(byLastActivityDesc)[0];
    if (!latest) return null;

    return {
      threadId: latest.threadId,
      lastActivityTime: lastActivityTime(latest),
    };
  },
});

// Appelé à l'envoi du premier message d'une conversation (création paresseuse :
// ouvrir le panel ne crée rien). Crée le thread et sa ligne de metadata, qui
// porte le lien vers le canvas.
export const startThread = mutation({
  args: {
    canvasId: v.id("canvases"),
  },
  returns: v.object({
    threadId: v.string(),
  }),
  handler: async (ctx, { canvasId }) => {
    const authUserId = await requireAuth(ctx);
    await requireCanvasAccess(ctx, canvasId, authUserId, "editor");

    // Create the actual thread
    const threadId = await createThread(ctx, components.agent, {
      userId: authUserId,
    });

    // Create the threadMetadata
    await ctx.runMutation(internal.wrappers.threadMetadataWrappers.create, {
      threadId,
      canvasId,
      userId: authUserId,
      agentName: threadAgentNames.nole,
    });
    return { threadId };
  },
});

/**
 * Conversations Nolë de l'utilisateur sur ce canvas, la plus récemment active
 * d'abord. Les threads sont hydratés depuis le composant agent pour leur titre.
 */
export const listCanvasThreads = query({
  args: {
    canvasId: v.id("canvases"),
  },
  returns: v.array(
    v.object({
      threadId: v.string(),
      title: v.union(v.string(), v.null()),
      lastActivityTime: v.number(),
      // Celui du run en cours, sinon l'issue du dernier (cf.
      // `RunModels.threadRunState`).
      runStatus: v.union(threadRunStatusValidator, v.null()),
    }),
  ),
  handler: async (ctx, { canvasId }) =>
    loadNoleThreads(ctx, {
      canvasId,
      project: async (metadata, title) => ({
        threadId: metadata.threadId,
        title,
        lastActivityTime: lastActivityTime(metadata),
        runStatus: (await RunModels.threadRunState(ctx, metadata)).runStatus,
      }),
    }),
});

export const getThreadInfo = query({
  args: {
    threadId: v.string(),
  },
  returns: v.union(
    v.object({
      _id: v.string(),
      _creationTime: v.number(),
      title: v.union(v.string(), v.null()),
      summary: v.union(v.string(), v.null()),
      runStatus: v.union(threadRunStatusValidator, v.null()),
      lastRunError: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    if (!authUserId) return null;

    const thread = await getThreadMetadata(ctx, components.agent, {
      threadId: args.threadId,
    });

    if (!thread || thread.userId !== authUserId) return null;

    // L'état du run vit dans nos tables, pas dans le composant agent.
    const metadata = await findByThreadId(ctx, { threadId: args.threadId });
    const state = metadata
      ? await RunModels.threadRunState(ctx, metadata)
      : { runStatus: null, lastRunError: null };

    return {
      _id: thread._id,
      _creationTime: thread._creationTime,
      title: thread.title ?? null,
      summary: thread.summary ?? null,
      ...state,
    };
  },
});

export const listMessages = query({
  args: {
    threadId: v.string(),
    paginationOpts: paginationOptsValidator,
    streamArgs: vStreamArgs,
  },
  handler: async (ctx, { threadId, paginationOpts, streamArgs }) => {
    const authUserId = await requireAuth(ctx);
    if (!authUserId) {
      throw new Error(errors.UNAUTHORIZED_USER);
    }

    const thread = await getThreadMetadata(ctx, components.agent, {
      threadId,
    });
    if (!thread || thread.userId !== authUserId) {
      throw new Error(errors.THREAD_NOT_FOUND_OR_FORBIDDEN);
    }

    const streams = await syncStreams(ctx, components.agent, {
      threadId,
      streamArgs,
    });

    const paginated = await listUIMessages(ctx, components.agent, {
      threadId,
      paginationOpts,
    });

    return {
      ...paginated,
      streams,
    };
  },
});

export const abortStream = mutation({
  args: {
    threadId: v.string(),
  },
  returns: v.object({
    aborted: v.boolean(),
  }),
  handler: async (ctx, { threadId }) => {
    const authUserId = await requireAuth(ctx);
    if (!authUserId) {
      throw new Error(errors.UNAUTHORIZED_USER);
    }

    console.log(`Aborting stream for threadId: ${threadId}`);

    const thread = await getThreadMetadata(ctx, components.agent, {
      threadId,
    });
    if (!thread || thread.userId !== authUserId) {
      throw new Error(errors.THREAD_NOT_FOUND_OR_FORBIDDEN);
    }

    // 1) Le run de la harness : ses tâches s'arrêtent (une génération qui
    // attend ses tools n'enchaînera plus), le run passe `aborted`. C'est ce
    // qui coupe le travail même quand rien ne streame — pendant un tool.
    const stoppedRun = (await findByThreadId(ctx, { threadId }))?.run;
    const runAborted = await abortRun(ctx, threadId);

    // 2) Le stream en cours, s'il y en a un : coupé net.
    const activeStreams = await ctx.runQuery(components.agent.streams.list, {
      threadId,
      statuses: ["streaming"],
    });
    let streamAborted = false;
    if (activeStreams.length > 0) {
      const currentStream = activeStreams.reduce((latest, stream) =>
        stream.order > latest.order ? stream : latest,
      );
      streamAborted = await ctx.runMutation(
        components.agent.streams.abortByOrder,
        {
          threadId,
          order: currentStream.order,
          reason: "Cancelled by user",
        },
      );
    }

    const aborted = runAborted || streamAborted;
    if (runAborted && stoppedRun) {
      // Appuyer sur stop est déjà un accusé de réception : la tâche ne doit pas
      // resurgir pour se faire relire. Après la fin du run, et pas avant :
      // `markReviewed` refuse un run qui n'est pas fini.
      const run = await RunModels.findByRunMessageId(
        ctx,
        stoppedRun.startMessageId,
      );
      if (run) await RunModels.markReviewed(ctx, run);
    }

    return { aborted };
  },
});

/**
 * Ouvrir une conversation depuis une tâche, c'est en relire toutes les tâches
 * finies.
 */
export const markThreadReviewed = mutation({
  args: {
    threadId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { threadId }) => {
    const authUserId = await requireAuth(ctx);
    if (!authUserId) {
      throw new Error(errors.UNAUTHORIZED_USER);
    }

    const thread = await getThreadMetadata(ctx, components.agent, {
      threadId,
    });
    if (!thread || thread.userId !== authUserId) {
      throw new Error(errors.THREAD_NOT_FOUND_OR_FORBIDDEN);
    }

    await RunModels.markThreadReviewed(ctx, threadId);
    return null;
  },
});

export const deleteThread = action({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    const authUserId = await requireAuth(ctx);
    if (!authUserId) {
      throw new Error(errors.UNAUTHORIZED_USER);
    }

    const thread = await getThreadMetadata(ctx, components.agent, {
      threadId,
    });
    if (!thread || thread.userId !== authUserId) {
      throw new Error(errors.THREAD_NOT_FOUND_OR_FORBIDDEN);
    }

    // Ce que l'app garde du thread hors du composant (runs, tâches, metadata
    // des messages…) et ses sous-agents, par lots. Son run s'arrête au passage.
    while (
      await ctx.runMutation(internal.harness.purge.purgeThread, { threadId })
    ) {
      // Un lot par transaction.
    }

    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
      threadId,
    });

    // Le listing par canvas part de `threadMetadata` : sans ça, le thread
    // supprimé resterait dans l'historique.
    await ctx.runMutation(internal.wrappers.threadMetadataWrappers.remove, {
      threadId,
    });

    return { success: true };
  },
});

export const updateThreadTitle = action({
  args: { threadId: v.string(), onlyIfUntitled: v.optional(v.boolean()) },
  handler: async (ctx, { threadId, onlyIfUntitled }) => {
    const authUserId = await requireAuth(ctx);
    if (!authUserId) {
      throw new Error(errors.UNAUTHORIZED_USER);
    }

    const threadMetadata = await getThreadMetadata(ctx, components.agent, {
      threadId,
    });
    if (!threadMetadata || threadMetadata.userId !== authUserId) {
      throw new Error(errors.THREAD_NOT_FOUND_OR_FORBIDDEN);
    }

    await generateTitle(ctx, threadId, onlyIfUntitled ?? false);
  },
});

/**
 * Titre d'un thread ouvert par l'aiguillage (cf. harness/dispatch.ts) : pas de
 * client pour le demander, comme le fait `useNoleChat` après un envoi.
 */
export const generateThreadTitle = internalAction({
  args: { threadId: v.string() },
  handler: async (ctx, { threadId }) => {
    await generateTitle(ctx, threadId, true);
  },
});

async function generateTitle(
  ctx: ActionCtx,
  threadId: string,
  onlyIfUntitled: boolean,
) {
  // `usageSource` explicite : c'est le seul usage de `createBaseAgent` qui
  // appelle réellement un LLM, et sa consommation était jusqu'ici invisible.
  const basicAgent = createBaseAgent({
    usageSource: aiUsageSources.threadTitle,
  });
  const { thread } = await basicAgent.continueThread(ctx, { threadId });

  if (onlyIfUntitled) {
    const metadata = await thread.getMetadata();
    if (metadata.title && metadata.title.trim().length > 0) {
      return;
    }
  }

  const {
    object: { title },
  } = await thread.generateObject(
    {
      schema: z.object({
        title: z.string().describe("The new title for the thread"),
      }),
      prompt:
        "Generate a title for this thread. Short and based on the content of the thread. It should be concise and descriptive, and allow the user to understand the topic of the thread at a glance.",
    },
    { storageOptions: { saveMessages: "none" } },
  );

  await thread.updateMetadata({ title });
}
