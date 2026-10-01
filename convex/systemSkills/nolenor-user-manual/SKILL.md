---
name: nolenor-user-manual
description: User manual of the Nolënor app, from the user's side (screens, buttons, menus, shortcuts, settings). Load it FIRST when the user asks how to do something in Nolënor, where a feature is, what a button or shortcut does, how sharing, windows, tables, search, settings, mobile or Nolë's own abilities work, or why the app behaves a certain way.
---

# Nolënor user manual — start here

This manual lets you answer questions about **using Nolënor as a user**: the interface, where things are, what they do. It is not about the content of the user's canvas (read the canvas for that).

## How to use it

1. If the quick facts below fully answer the question, answer now. No more loading.
2. Otherwise load the **one** section that matches (table below) with `load_skill`, using its exact name. Sections are not listed in `<available_skills>`; they only exist through this page.
3. Load a second section only if the question truly spans two areas. Never load more than three, and never "load everything to be safe".
4. Answer in the user's language, briefly, as numbered steps when it is a procedure. Quote on-screen labels exactly as written in the manual (the interface is in English, a few labels are in French), then explain them in the user's language if needed. Give the keyboard shortcut when there is one. Say when something differs on phone.
5. If the manual does not cover the question, or you are not sure a button exists, say so plainly. Never invent a menu, a label, a setting or a shortcut. Do not describe anything from the "Not available yet" list below as usable.
6. Answering is enough. Do not act on the canvas for a "how do I…" question unless the user asks you to do it for them.

## Vocabulary (the interface mixes several words)

- **Canvas** = **workspace**: one infinite board. "Workspace" appears in the create/edit dialog and on mobile; "canvas" everywhere else.
- **Block** = **node**. Most menus say "block"; some say "node" (Add a node, Move node to another canvas, Navigate to node). Same thing.
- **Document** block is labelled **Blocknote** in the Add menu and **Notes** in the search filter. **PDF** block also holds any other file (Word, Excel, zip…).
- **Connection** = edge = arrow between two blocks. **Frame** = labelled box grouping blocks.
- **Window** = the large editor that opens on a block. **Panel** = its side panel.
- **Nolë** = the assistant. **Conversation** = thread = chat. **Task** = a Nolë conversation with work the user has not reviewed yet.
- **Bookmark** = saved spot on a canvas (a block, a selection or a view).

## Where things are (desktop canvas)

- **Top-left**: sidebar toggle, canvas icon and name, ⋮ "Canvas options" (owner: Edit / Delete), Undo / Redo.
- **Top-right**: sync cloud (Synced / Saving… / Sync error), Trash, **Share** (owner only), Settings (gear).
- **Bottom-centre toolbar**: Select tool, Hand tool, Draw a frame (F), Add a block (+), Search (Ctrl+K), Command center (Ctrl+P).
- **Bottom-left**: the **Nolë** button (N) with the activity dock of Nolë's tasks next to it.
- **Bottom-right**: minimized windows, then **Bookmarks** (B).
- **Sidebar** (home and canvas): New canvas, Search (Ctrl/⌘+P), Home, Inbox, Tutorials, canvas list, AI usage, account menu (Settings, Sign out).

## Block types at a glance
**Title** (heading or label) · **Document** (rich text, "Blocknote") · **Value** (one figure) · **Table** (typed columns and rows) · **Image** (one or several pictures, can be generated) · **Audio** · **Video** · **PDF** (PDF reader, or any other file) · **Link** (band, card or embedded page) · **App** (small interactive app written by Nolë) · **Frame** (box grouping blocks, drawn with the F tool).

## Visual cues
Blue ring = selected block. **Violet dashed outline** = attached to Nolë (it will read it first). Small bookmark badge on a corner = bookmarked. Dashed grey chips above the Nolë message box = selected blocks you can attach with **+**. Violet number on **Inbox** or "N tasks" pill = Nolë work to review. Cloud icon top-right: green synced, yellow saving, red sync error.

## Quick facts

- **Create a canvas**: sidebar **New canvas** (on phone: the button at the top of Home).
- **Add a block**: **+** in the bottom toolbar, or right-click the empty canvas, or press T / D / I / A / L with the pointer on the canvas, or drop files, or paste.
- **Open a block in a window**: double-click it, or select it and press Enter, or **Open** in its toolbar.
- **Talk to Nolë**: **Nolë** button or N. Enter sends, Shift+Enter adds a line.
- **Show Nolë a block**: Alt+click the block (attach), or type @ in the message. Nolë only works on the canvas that is open.
- **Connect two blocks**: select a block, drag from one of its small side handles to another block.
- **Undo**: Ctrl+Z (your own actions, this tab only, lost on reload). **Deleted a block?** top-right **Trash** (kept 30 days). **Content changed (by Nolë or a person)?** window → **Panel** → **Versions** (30 days).
- **Share**: **Share** top-right (owner only): public link, or invite an existing user by email as Viewer or Editor.
- **Find something**: Ctrl+K searches inside the canvas; Ctrl+P jumps to a canvas or bookmark.
- **Change a block** (colour, style, layer, duplicate, delete): right-click it. **Move to another canvas** is in the same menu.
- **Cannot edit anything?** The user is a Viewer (or on a public link): the owner must make them Editor.
- **Settings**: gear icon (canvas, top-right) or account menu at the bottom of the sidebar.
- **Phone** (screen narrower than 768 px) has its own layout with three tabs: Canvas, Recherche, Chat.

## Not available yet (do not present as usable)

- **Recipes** and **Custom nodes / templates**: hidden from the production app.
- **Tutorials** page: placeholder showing "Coming soon".
- No per-plan quotas or billing screen: **AI usage** only shows what has been consumed.
- Nolë cannot delete a block from the canvas (it can remove paragraphs inside a document or rows inside a table), cannot start an image generation or a transcription, cannot watch a video.

## Sections (load by exact name)

| Name | Load when the question is about… |
| --- | --- |
| `manual-home-and-canvases` | Home page, sidebar, creating / editing / deleting a canvas (icon, colour, cover, background), first-run screen, welcome tips, Tutorials page, "new version available" banner |
| `manual-canvas-navigation` | Panning, zooming, selecting, Select / Hand tools, search (Ctrl+K), command center (Ctrl+P), bookmarks, the sync indicator |
| `manual-canvas-blocks` | Adding, importing (drop / paste), moving, resizing, colour, layers, appearance, duplicate, copy/paste, delete, move to another canvas, copying block IDs |
| `manual-connections-and-frames` | Connections (create, label, style, delete), frames (draw, title, contents) |
| `manual-blocks-text` | Title, Document (Blocknote: slash menu, @ mentions, callouts, dates) and Value blocks |
| `manual-block-table` | Table block: columns, rows, filters, sort, summaries, CSV import/export |
| `manual-blocks-media` | Image (carousel/grid, generation), Audio, Video, PDF / file blocks, transcription |
| `manual-blocks-link-and-app` | Link block (band, preview, embed) and App block (interactive mini-apps) |
| `manual-windows` | Block windows: header buttons, save, minimize, fullscreen, side panel (Plan, Links, Versions) |
| `manual-undo-history-trash` | Undo/redo limits, Trash, version history and restore, "Nolë changed/deleted something, how do I go back?" |
| `manual-nole-chat` | Using the Nolë panel: sending, conversations, models, voice dictation, attaching context, @ mentions, stop, statuses |
| `manual-nole-activity-and-inbox` | Nolë's tasks: activity dock, Inbox page, statuses, "mark as reviewed", Nolë working in the background |
| `manual-nole-capabilities` | What Nolë can and cannot do, what it sees, how to ask well, apps and tables made by Nolë |
| `manual-memory-and-skills` | Settings → Agent Memory and Skills (teach Nolë things, write your own skills) |
| `manual-sharing-and-permissions` | Share dialog, public link, Viewer / Editor / Owner, collaborating, viewing without an account |
| `manual-account-settings-and-data` | Signing up / in / out, password reset, account name, AI usage page, data export, deleting the account |
| `manual-mcp-and-api-tokens` | Connecting Claude or another MCP client, API tokens, Read vs Write |
| `manual-mobile-and-tablet` | The phone layout, gestures, dictation on phone, tablets, installable app |
| `manual-shortcuts` | Complete keyboard and mouse shortcut list |
| `manual-troubleshooting-and-limits` | Error messages, file size / type limits, rate limits, "it doesn't work", what cannot be done |

## Two-section questions (examples)

- "Build a dashboard from my table" → `manual-nole-capabilities` + `manual-blocks-link-and-app`.
- "Nolë deleted a block / I lost my text" → `manual-undo-history-trash` only.
- "Share my canvas read-only" → `manual-sharing-and-permissions` only.
