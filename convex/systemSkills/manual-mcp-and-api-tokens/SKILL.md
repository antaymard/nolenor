---
name: manual-mcp-and-api-tokens
description: Nolënor manual section - connecting other AI tools (Claude Code, Claude Desktop, other MCP clients) to the user's canvases with an API token - creating, reading-only versus read-write tokens, the ready-made connect command, editing and revoking tokens, pointing the tool at a block with Copy ID, what such a tool can and cannot do. Load through nolenor-user-manual only.
hidden: true
---

# MCP and API tokens (connect Claude or another AI tool)

Nolënor exposes the user's canvases through the **Model Context Protocol (MCP)**: an outside AI assistant can read, search and edit blocks, like a second Nolë. Access is granted with an **API token** created in Settings. (The Tutorials card "Connect Claude or ChatGPT" is still "Coming soon".)

## Create a token
1. **Settings → MCP & API tokens** (group **Developer**). Subtitle: "Create tokens to let third-party tools and agents (e.g. MCP servers) access the nolënor API on your behalf."
2. **New token** → dialog **New API token**:
   - **Name** ("e.g. My MCP agent"): to recognise it later.
   - **Permission**: **Read** (the tool can list, read and search canvases) or **Write** (also create and edit blocks, rows, connections…).
3. **Create token**. The dialog **Token created** shows the token **once**: "Copy this token now. For security reasons, it will not be shown again." (**Copy token**).
4. The same dialog shows a **Connect Claude Code** command, ready to paste as a single line in a terminal (`claude mcp add --transport http nolenor <endpoint> --header "Authorization: Bearer <token>" --scope user`). For any other MCP client: give it the **endpoint URL** shown there and send the token in an `Authorization: Bearer …` header, or, for clients such as Claude Desktop that only offer preset header names, in `x-api-key`. **Done** closes it.

## Manage tokens
The list shows **Name**, **Token** (first characters only), **Permission**, **Created**, **Last used** ("Never" until first use).
- **Edit token** (pencil): rename it or change its permission.
- **Revoke token** (bin): "Any application using it will immediately lose access." A revoked token cannot be edited or reused; **Show revoked (n)** / **Hide revoked (n)** toggles them in the list.
- Treat a token like a password. If it leaked, revoke it and create another. A lost token cannot be displayed again.

## What the connected tool can do
- It acts **as you**, with your rights on each canvas: a **Read** token only reads; a **Write** token can edit the canvases where you are **Editor or Owner** (not those where you are only Viewer).
- Available actions mirror Nolë's canvas tools: list canvases, list / read / search blocks, create blocks and connections, group blocks in a frame, set values, edit documents block by block, edit tables (columns and rows), patch an App's code.
- It **cannot** delete blocks, browse the web for you, generate images, transcribe, use Nolë's memory or skills, or touch settings and sharing.
- Changes it makes show up live on the canvas and appear as "Agent" edits in a block's **Versions**.

## Point the tool at a block
Right-click a block → **Copy ID** → **Node ID** or **Canvas & node ID** (several selected blocks: **Copy IDs**). Paste the copied reference (for example `canvasId:…|nodeId:…`) into the conversation with the external tool so it knows exactly which canvas and block you mean.

See also: `manual-account-settings-and-data`, `manual-nole-capabilities`.
