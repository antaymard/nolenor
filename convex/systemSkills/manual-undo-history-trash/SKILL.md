---
name: manual-undo-history-trash
description: Nolënor manual section - getting back to an earlier state - undo and redo (what they cover and their limits), the Trash for deleted blocks, version history of a block (who changed what, preview, restore), what cannot be recovered, and which tool to use when Nolë or a collaborator changed or deleted something. Load through nolenor-user-manual only.
hidden: true
---

# Undo, Trash and version history

## Which tool for which accident
| What happened | Use |
| --- | --- |
| I just moved / recoloured / deleted / connected something | **Undo** (Ctrl/⌘+Z) |
| I deleted a block earlier, after a reload, or someone else did | **Trash** (top-right), within 30 days |
| Text, a table or an app's code was changed (by me, Nolë or a collaborator) and I want the earlier content | **Versions** in the block's window, within 30 days |
| Nolë moved, resized or recoloured blocks | Not undoable with Ctrl+Z; put them back by hand |
| I deleted a whole canvas | Cannot be recovered |

## Undo / redo
- **Undo**: Ctrl/⌘+Z or the ↶ button at the top-left of the canvas (phone: the bottom bar's undo). **Redo**: Ctrl/⌘+Shift+Z or Ctrl+Y, or the ↷ button.
- It covers **your own gestures**: creating, moving, resizing, colouring, connecting, deleting blocks and connections, drawing a frame. One mouse gesture = one undo step.
- Limits, important to state:
  - The history lives in your browser tab: **a page reload empties it**.
  - **Nolë's changes and other people's changes are not in it**, and Ctrl+Z will not revert them. If Nolë or someone moved the same block after you, your undo puts back what *you* had.
  - **Merge images** cannot be undone.
  - Inside a document or a text field, Ctrl+Z is that editor's own undo while you type.
  - Viewers have no undo (they cannot edit).

## Trash
- Top-right **Trash** button (hidden for Viewers). Dialog text: "Deleted blocks are kept for 30 days. Restoring one brings back its content and the connections that went with it."
- Each line: icon, title, "Deleted … ago" (and "· content already deleted" if the content is gone). **Restore** brings the block back where it was, with its connections.
- A deleted **frame** appears as one line; restoring it brings back its contents.
- After 30 days a block is purged for good. Only blocks are listed: a connection deleted alone is brought back with Undo. Whole canvases are not in the Trash.

## Version history of a block
- Every block keeps a history of its **content** (document text, table data, value, link, images list, an App's code…). Positions, colours and sizes are not part of it.
- **See it**: open the block's window → **Panel** → **Versions** (phone: window menu ⋯ → **History**). Lines read "User · Updated", "Agent · Updated" (Nolë), "User · Restored", with how long ago (hover for the date).
- A person (or Nolë) editing continuously produces **at most one version every 15 minutes**: versions mark editing sessions, not keystrokes. Versions are kept **30 days**, and they survive the deletion of the block.
- **Preview**: click a version; the window shows it on a yellow background with a banner. Save any pending change first ("Save your changes before previewing a version."). **Cancel** leaves the preview; **Restore this version** puts its content back ("Version restored.") and is itself recorded, so a restore can be undone by restoring the previous version.
- **Who changed this block?** Panel → **Links** → **Threads** lists the Nolë conversations that edited it, each with an **Open** button.
- For an **App** block only the code is versioned, not the data the app saved.

## Keep a copy
**Settings → Export my data** downloads your canvases as a zip (see `manual-account-settings-and-data`). Do it before deleting a canvas or your account.

## Nolë and deletions
Nolë cannot delete a block from the canvas. It can rewrite the content of a block, remove paragraphs in a document, or rows in a table: those are covered by **Versions**.

See also: `manual-windows` (Versions tab), `manual-canvas-blocks` (delete).
