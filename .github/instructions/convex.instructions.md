---
applyTo: "**/*.ts,**/*.tsx,**/*.js,**/*.jsx"
---

# Convex instructions (repo canonical)

## Source of truth

- Always follow `convex/_generated/ai/guidelines.md` first for generic Convex rules.
- This file contains only repo-level conventions and the most important guardrails.

## API and architecture

- Use `query`, `mutation`, `action`, `internalQuery`, `internalMutation`, `internalAction` with the object syntax.
- Always define `args` validators. Return validators are optional unless explicitly needed.
- Keep wrappers thin in `convex/*.ts`: auth + validation + delegate to model/helpers.
- Business logic belongs in `convex/model/**` (or pure helpers), not in API wrappers.
- Keep layer boundaries strict to avoid deep instantiation/type cycles:
  - `schemas/` has data contracts/types only (no `_generated/api` imports).
  - `model/` can use `ctx.db` and context types, but no `api/internal/components` imports.
  - API wrapper/action assembly files can wire function references.

## Function references and scheduling

- Use `api.*` for public calls and `internal.*` for private calls.
- In schedulers/crons, only call `internal.*` functions.
- Use `ctx.runAction` only when crossing runtimes; otherwise call shared TS helpers directly.
- Use `ctx.runQuery` / `ctx.runMutation` sparingly from queries/mutations to avoid overhead.

## Query and performance rules

- Do not use `.filter()` for DB queries when an index can be used; prefer `withIndex` / `withSearchIndex`.
- Avoid unbounded `.collect()` on potentially large tables; prefer `.take(n)` or `.paginate(...)`.
- Do not use `Date.now()` directly inside reactive queries; pass time as an argument or use scheduled updates.

## Auth and safety

- For public functions, enforce access control with `ctx.auth.getUserIdentity()`.
- Never trust spoofable identity fields passed from the client (email/userId in args) for authorization.

## Runtime and typing

- Put Node-only actions in files with `"use node";` and do not mix them with queries/mutations.
- Prefer strict Convex types (`Id<"table">`, `Doc<"table">`) over `string`/`any`.
- Always pass the table name form for DB calls in this repo style (for example `ctx.db.get("table", id)`).
- Avoid `anyApi`.

## Validation step

- After structural Convex changes, run `yarn convex codegen`.
  returns: v.id("channels"),
  handler: async (ctx, args) => {
  return await ctx.db.insert("channels", { name: args.name });
  },
  });

/\*\*

- List the 10 most recent messages from a channel in descending creation order.
  \*/
  export const listMessages = query({
  args: {
  channelId: v.id("channels"),
  },
  returns: v.array(
  v.object({
  \_id: v.id("messages"),
  \_creationTime: v.number(),
  channelId: v.id("channels"),
  authorId: v.optional(v.id("users")),
  content: v.string(),
  }),
  ),
  handler: async (ctx, args) => {
  const messages = await ctx.db
  .query("messages")
  .withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
  .order("desc")
  .take(10);
  return messages;
  },
  });

/\*\*

- Send a message to a channel and schedule a response from the AI.
  \*/
  export const sendMessage = mutation({
  args: {
  channelId: v.id("channels"),
  authorId: v.id("users"),
  content: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
  const channel = await ctx.db.get(args.channelId);
  if (!channel) {
  throw new Error("Channel not found");
  }
  const user = await ctx.db.get(args.authorId);
  if (!user) {
  throw new Error("User not found");
  }
  await ctx.db.insert("messages", {
  channelId: args.channelId,
  authorId: args.authorId,
  content: args.content,
  });
  await ctx.scheduler.runAfter(0, internal.index.generateResponse, {
  channelId: args.channelId,
  });
  return null;
  },
  });

const openai = new OpenAI();

export const generateResponse = internalAction({
args: {
channelId: v.id("channels"),
},
returns: v.null(),
handler: async (ctx, args) => {
const context = await ctx.runQuery(internal.index.loadContext, {
channelId: args.channelId,
});
const response = await openai.chat.completions.create({
model: "gpt-4o",
messages: context,
});
const content = response.choices[0].message.content;
if (!content) {
throw new Error("No content in response");
}
await ctx.runMutation(internal.index.writeAgentResponse, {
channelId: args.channelId,
content,
});
return null;
},
});

export const loadContext = internalQuery({
args: {
channelId: v.id("channels"),
},
returns: v.array(
v.object({
role: v.union(v.literal("user"), v.literal("assistant")),
content: v.string(),
}),
),
handler: async (ctx, args) => {
const channel = await ctx.db.get(args.channelId);
if (!channel) {
throw new Error("Channel not found");
}
const messages = await ctx.db
.query("messages")
.withIndex("by_channel", (q) => q.eq("channelId", args.channelId))
.order("desc")
.take(10);

    const result = [];
    for (const message of messages) {
      if (message.authorId) {
        const user = await ctx.db.get(message.authorId);
        if (!user) {
          throw new Error("User not found");
        }
        result.push({
          role: "user" as const,
          content: `${user.name}: ${message.content}`,
        });
      } else {
        result.push({ role: "assistant" as const, content: message.content });
      }
    }
    return result;

},
});

export const writeAgentResponse = internalMutation({
args: {
channelId: v.id("channels"),
content: v.string(),
},
returns: v.null(),
handler: async (ctx, args) => {
await ctx.db.insert("messages", {
channelId: args.channelId,
content: args.content,
});
return null;
},
});

````

#### convex/schema.ts
```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  channels: defineTable({
    name: v.string(),
  }),

  users: defineTable({
    name: v.string(),
  }),

  messages: defineTable({
    channelId: v.id("channels"),
    authorId: v.optional(v.id("users")),
    content: v.string(),
  }).index("by_channel", ["channelId"]),
});
````

#### src/App.tsx

```typescript
export default function App() {
  return <div>Hello World</div>;
}
```
