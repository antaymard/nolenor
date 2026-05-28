import { action, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { requireAuth } from "./lib/auth";
import { components } from "./_generated/api";
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

function isHiddenThread(title?: string): boolean {
  return (title?.startsWith("__") || !title) ?? false;
}

export const getLatestThread = query({
  args: {},
  returns: v.union(
    v.object({
      threadId: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const authUserId = await requireAuth(ctx);

    const result = await ctx.runQuery(
      components.agent.threads.listThreadsByUserId,
      {
        userId: authUserId,
        order: "desc",
        paginationOpts: { numItems: 15, cursor: null },
      },
    );

    if (!result || result.page.length === 0) {
      return null;
    }

    const visibleThread = result.page.find((t) => !isHiddenThread(t.title));
    return visibleThread ? { threadId: visibleThread._id } : null;
  },
});

export const startThread = mutation({
  args: {},
  returns: v.object({
    threadId: v.string(),
  }),
  handler: async (ctx) => {
    const authUserId = await requireAuth(ctx);
    const threadId = await createThread(ctx, components.agent, {
      userId: authUserId,
    });
    return { threadId };
  },
});

export const listUserThreads = query({
  args: {
    paginationOpts: paginationOptsValidator,
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);

    if (!authUserId) {
      return {
        success: false,
        threads: [],
        error: errors.UNAUTHORIZED_USER,
      };
    }

    const threads = await ctx.runQuery(
      components.agent.threads.listThreadsByUserId,
      { userId: authUserId, paginationOpts: args.paginationOpts },
    );

    return {
      success: true,
      threads: {
        ...threads,
        page: threads.page.filter((t) => !isHiddenThread(t.title)),
      },
    };
  },
});

export const getThreadInfo = query({
  args: {
    threadId: v.string(),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    const authUserId = await requireAuth(ctx);
    if (!authUserId) return null;

    const thread = await getThreadMetadata(ctx, components.agent, {
      threadId: args.threadId,
    });

    if (!thread || thread.userId !== authUserId) return null;

    return {
      _id: thread._id,
      _creationTime: thread._creationTime,
      title: thread.title ?? null,
      summary: thread.summary ?? null,
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

    const activeStreams = await ctx.runQuery(components.agent.streams.list, {
      threadId,
      statuses: ["streaming"],
    });

    if (activeStreams.length === 0) {
      return { aborted: false };
    }

    const currentStream = activeStreams.reduce((latest, stream) =>
      stream.order > latest.order ? stream : latest,
    );

    const aborted = await ctx.runMutation(
      components.agent.streams.abortByOrder,
      {
        threadId,
        order: currentStream.order,
        reason: "Cancelled by user",
      },
    );

    return { aborted };
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

    await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
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

    const basicAgent = createBaseAgent();
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
  },
});
