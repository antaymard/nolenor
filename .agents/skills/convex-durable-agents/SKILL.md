---
name: convex-durable-agents
description: Build AI agents that can run indefinitely and survive failures and restarts. Use this skill whenever working with Durable Agents Component for Convex or related Convex component functionality.
---

# Durable Agents Component for Convex

## Instructions

This component provides durable AI agents that can run indefinitely and survive server restarts or failures. Built on AI SDK v6, it executes agent tool loops asynchronously to avoid Convex action time limits while maintaining persistent streaming and automatic retries. Agents can call external APIs through Convex actions and optionally route execution through workpools for parallelism control.

### Installation

```bash
npm install convex-durable-agents
```

## Use cases

- **Long-running AI workflows** that need to survive dev server restarts and production failures without losing conversation state
- **AI agents with external API calls** that require automatic retry logic and durable execution when tools fail or timeout
- **Multi-step agent tasks** that exceed Convex action time limits by running tool loops asynchronously with persistent state
- **Production chatbots** that need real-time streaming with message persistence and the ability to resume interrupted conversations
- **Background AI processing** where agents need to continue working even when the user disconnects or the browser closes

## How it works

The component wraps AI SDK's `streamText` API with Convex's durable execution model. You define agents using `streamHandlerAction` with your language model and tools, then export a complete API using `defineAgentApi` for public access or `defineInternalAgentApi` for server-only access.

Tools are implemented as Convex actions using `createActionTool` for synchronous results or `createAsyncTool` for background processing. The component handles automatic retries with configurable backoff strategies and can route execution through `@convex-dev/workpool` for parallelism control.

Real-time streaming works through `streamUpdates` queries that deliver message deltas to React components via the `useAgentChat` hook. Thread state persists across failures, allowing agents to resume exactly where they left off using `resumeThread`. Authorization callbacks protect thread access, and the component maintains full conversation history with support for both user messages and tool execution results.

## When NOT to use

- When a simpler built-in solution exists for your specific use case
- If you are not using Convex as your backend
- When the functionality provided by Durable Agents Component for Convex is not needed

## Resources

- [npm package](https://www.npmjs.com/package/convex-durable-agents)
- [GitHub repository](https://github.com/ziegfried/convex-durable-agents)
- [Live demo](https://github.com/ziegfried/convex-durable-agents/tree/main/example)
- [Convex Components Directory](https://www.convex.dev/components/durable-agents)
- [Convex documentation](https://docs.convex.dev)