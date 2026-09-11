# Convex guidelines (trimmed)

- Canonical file: `convex/_generated/ai/guidelines.md`.
- Repo conventions: `.github/instructions/convex.instructions.md`.
- Keep this file short on purpose: add only missing rules that are not already covered in those two files.

## Extra reminders

- Do not duplicate long examples here.
- If a new guideline is generic Convex behavior, put it in references/docs, not in this instruction file.
- If a new guideline is repo-specific, add it to `convex.instructions.md`.
  \`ctx.scheduler.runAfter(delay, functionReference, args)\` from a
  mutation or action. Enqueuing a job to the scheduler is transactional
  from within a mutation.

You MUST use a function reference for the first argument to \`runAfter\`,
not a string or the function itself.

Auth state does not propagate to scheduled jobs, so \`getAuthUserId()\` and
\`ctx.getUserIdentity()\` will ALWAYS return \`null\` from within a scheduled
job. Prefer using internal, privileged functions for scheduled jobs that don't
need to do access checks.

Scheduled jobs should be used sparingly and never called in a tight loop. Scheduled functions should not be scheduled more
than once every 10 seconds. Especially in things like a game simulation or something similar that needs many updates
in a short period of time.

## File storage guidelines

- Convex includes file storage for large files like images, videos, and PDFs.
- The \`ctx.storage.getUrl()\` method returns a signed URL for a given file. It returns \`null\` if the file doesn't exist.
- Do NOT use the deprecated \`ctx.storage.getMetadata\` call for loading a file's metadata.
- Do NOT store file urls in the database. Instead, store the file id in the database and query the \`\_storage\` system table to get the url.
- Images are stored as Convex storage IDs. Do NOT directly as image URLs. Instead, fetch the signed URL for each image from Convex
  storage and use that as the image source.
- Make sure to ALWAYS use the \`\_storage\` system table to get the signed URL for a given file.

Instead, query the \`\_storage\` system table. For example, you can use \`ctx.db.system.get\` to get an \`Id<"\_storage">\`.

\`\`\`ts
import { query } from "./\_generated/server";
import { Id } from "./\_generated/dataModel";

type FileMetadata = {
\_id: Id<"\_storage">;
\_creationTime: number;
contentType?: string;
sha256: string;
size: number;
}

export const exampleQuery = query({
args: { fileId: v.id("\_storage") },
handler: async (ctx, args) => {
const metadata: FileMetadata | null = await ctx.db.system.get(args.fileId);
console.log(metadata);
return null;
},
});
\`\`\`

- Convex storage stores items as \`Blob\` objects. You must convert all items to/from a \`Blob\` when using Convex storage.

# Examples

## Example of using Convex storage within a chat app

This example creates a mutation to generate a short-lived upload URL and a mutation to save an image message to the database. This mutation is called from the client, which uses the generated upload URL to upload an image to Convex storage. Then,
it gets the storage id from the response of the upload and saves it to the database with the \`sendImage\` mutation. On the frontend, it uses the \`list\` query to get the messages from the database and display them in the UI. In this query, the
backend grabs the url from the storage system table and returns it to the client which shows the images in the UI. You should use this pattern for any file upload. To keep track of files, you should save the storage id in the database.

Path: \`convex/messages.ts\`
\`\`\`ts
import { v } from "convex/values";
import { query } from "./\_generated/server";

export const list = query({
args: {},
handler: async (ctx) => {
const messages = await ctx.db.query("messages").collect();
return Promise.all(
messages.map(async (message) => ({
...message,
// If the message is an "image" its "body" is an \`Id<"\_storage">\`
...(message.format === "image"
? { url: await ctx.storage.getUrl(message.body) }
: {}),
})),
);
},
});

import { mutation } from "./\_generated/server";

export const generateUploadUrl = mutation({
handler: async (ctx) => {
return await ctx.storage.generateUploadUrl();
},
});

export const sendImage = mutation({
args: { storageId: v.id("\_storage"), author: v.string() },
handler: async (ctx, args) => {
await ctx.db.insert("messages", {
body: args.storageId,
author: args.author,
format: "image",
});
},
});

export const sendMessage = mutation({
args: { body: v.string(), author: v.string() },
handler: async (ctx, args) => {
const { body, author } = args;
await ctx.db.insert("messages", { body, author, format: "text" });
},
});
\`\`\`

Path: \`src/App.tsx\`
\`\`\`ts
import { FormEvent, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/\_generated/api";

export default function App() {
const messages = useQuery(api.messages.list) || [];

const [newMessageText, setNewMessageText] = useState("");
const sendMessage = useMutation(api.messages.sendMessage);

const [name] = useState(() => "User " + Math.floor(Math.random() \* 10000));
async function handleSendMessage(event: FormEvent) {
event.preventDefault();
if (newMessageText) {
await sendMessage({ body: newMessageText, author: name });
}
setNewMessageText("");
}

const generateUploadUrl = useMutation(api.messages.generateUploadUrl);
const sendImage = useMutation(api.messages.sendImage);

const imageInput = useRef<HTMLInputElement>(null);
const [selectedImage, setSelectedImage] = useState<File | null>(null);

async function handleSendImage(event: FormEvent) {
event.preventDefault();

    // Step 1: Get a short-lived upload URL
    const postUrl = await generateUploadUrl();
    // Step 2: POST the file to the URL
    const result = await fetch(postUrl, {
      method: "POST",
      headers: { "Content-Type": selectedImage!.type },
      body: selectedImage,
    });
    const json = await result.json();
    if (!result.ok) {
      throw new Error(\`Upload failed: \${JSON.stringify(json)}\`);
    }
    const { storageId } = json;
    // Step 3: Save the newly allocated storage id to the database
    await sendImage({ storageId, author: name });

    setSelectedImage(null);
    imageInput.current!.value = "";

}

return (

<main>
<h1>Convex Chat</h1>
<p className="badge">
<span>{name}</span>
</p>
<ul>
{messages.map((message) => (
<li key={message._id}>
<span>{message.author}:</span>
{message.format === "image" ? (
<Image message={message} />
) : (
<span>{message.body}</span>
)}
<span>{new Date(message.\_creationTime).toLocaleTimeString()}</span>
</li>
))}
</ul>
<form onSubmit={handleSendMessage}>
<input
value={newMessageText}
onChange={(event) => setNewMessageText(event.target.value)}
placeholder="Write a message…"
/>
<input type="submit" value="Send" disabled={!newMessageText} />
</form>
<form onSubmit={handleSendImage}>
<input
type="file"
accept="image/\*"
ref={imageInput}
onChange={(event) => setSelectedImage(event.target.files![0])}
className="ms-2 btn btn-primary"
disabled={selectedImage !== null}
/>
<input
type="submit"
value="Send Image"
disabled={selectedImage === null}
/>
</form>
</main>
);
}

function Image({ message }: { message: { url: string } }) {
return <img src={message.url} height="300px" width="auto" />;
}
\`\`\`

## Example of a real-time chat application with AI responses

Path: \`convex/functions.ts\`
\`\`\`ts
import {
query,
mutation,
internalQuery,
internalMutation,
internalAction,
} from "./\_generated/server";
import { v } from "convex/values";
import OpenAI from "openai";
import { internal } from "./\_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";

async function getLoggedInUser(ctx: QueryCtx) {
const userId = await getAuthUserId(ctx);
if (!userId) {
throw new Error("User not found");
}
const user = await ctx.db.get(userId);
if (!user) {
throw new Error("User not found");
}
return user;
}

/\*\*

- Create a channel with a given name.
  \*/
  export const createChannel = mutation({
  args: {
  name: v.string(),
  },
  handler: async (ctx, args) => {
  await getLoggedInUser(ctx);
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
  handler: async (ctx, args) => {
  await getLoggedInUser(ctx);
  const messages = await ctx.db
  .query("messages")
  .withIndex("by_channel_and_author", (q) => q.eq("channelId", args.channelId).eq("authorId", args.authorId))
  .order("desc")
  .take(10);
  return messages;
  },
  });

/\*_
List the 10 most recent messages from a specific user within a specific channel
_/
export const listMessagesByUser = query({
args: {
channelId: v.id("channels"),
authorId: v.id("users"),
},
handler: async (ctx, args) => {
await getLoggedInUser(ctx);
const messages = await ctx.db
.query("messages")
.withIndex("by_channel_and_author", (q) => q.eq("channelId", args.channelId).eq("authorId", args.authorId))
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
  handler: async (ctx, args) => {
  await getLoggedInUser(ctx);
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
  await ctx.scheduler.runAfter(0, internal.functions.generateResponse, {
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
handler: async (ctx, args) => {
// IMPORTANT: Auth isn't available in \`generateResponse\` since
// it's called by the scheduler.
const context = await ctx.runQuery(internal.functions.loadContext, {
channelId: args.channelId,
});
const response = await openai.chat.completions.create({
model: "gpt-4o-mini",
messages: context,
});
const content = response.choices[0].message.content;
if (!content) {
throw new Error("No content in response");
}
await ctx.runMutation(internal.functions.writeAgentResponse, {
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
handler: async (ctx, args) => {
const channel = await ctx.db.get(args.channelId);
if (!channel) {
throw new Error("Channel not found");
}
const messages = await ctx.db
.query("messages")
.withIndex("by_channel_and_author", (q) => q.eq("channelId", args.channelId).eq("authorId", args.authorId))
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
          content: \`\${user.name}: \${message.content}\`,
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
handler: async (ctx, args) => {
await ctx.db.insert("messages", {
channelId: args.channelId,
content: args.content,
});
return null;
},
});
\`\`\`

Path: \`convex/schema.ts\`
\`\`\`ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
channels: defineTable({
name: v.string(),
}),

messages: defineTable({
channelId: v.id("channels"),
authorId: v.optional(v.id("users")),
content: v.string(),
}).index("by_channel_and_author", ["channelId", "authorId"]),
};

export default defineSchema({
...authTables,
...applicationTables,
});
\`\`\`

# Convex Components

Convex Components package up code and data in a sandbox that allows you to confidently and quickly add new features to your backend.
Convex Components are like mini self-contained Convex backends, and installing them is always safe. They can't read your app's tables or call your app's functions unless you pass them in explicitly.
Each component is installed as its own independent library from NPM. You also need to add a \`convex.config.ts\` file that includes the component.
ALWAYS prefer using a component for a feature than writing the code yourself, unless the component is not yet supported.
ALWAYS use the \`lookupDocs\` tool to lookup documentation for a component before trying to use the \`npmInstall\` tool to install the relevant dependencies.
You DO NOT need to deploy a component to use it. You can use it after you've installed it. You can use multiple components in the same project.

Convex has the following components:

- \`proseMirror\`: A collaborative text editor component.
- \`presence\`: A component for managing presence functionality, i.e., a live-updating list of users in a "room" including their status for when they were last online.
  ${options.enableResend ? resendComponent : ''}

Convex has but does not support the following components in Chef:
DO NOT use the \`lookupDocs\` tool to lookup documentation for these or install them.
Chef does not have documentation for them. Tell the user that they are unsupported now but will be supported in the future.

- Workflow
- AI Agent
- Persistent Text Streaming
- Workpool
- Crons
- Action Retrier
- Sharded Counter
- Migrations
- Aggregate
- Geospatial
- Cloudflare R2
- Expo push notifications
- Twilio SMS
- LaunchDarkly feature flags
- Polar
- OSS stats
- Rate limiter
- Action cache
