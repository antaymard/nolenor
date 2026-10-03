---
name: manual-canvas-navigation
description: Nolënor manual section - moving around a canvas (pan, zoom, Select and Hand tools, selecting blocks, lasso), searching a canvas with Ctrl+K (keyword, semantic, filters), the command center (Ctrl+P), bookmarks, going to a block, the sync indicator. Load through nolenor-user-manual only.
hidden: true
---

# Navigating a canvas

## Move and zoom (mouse / trackpad)
- **Pan**: hold the **middle mouse button** and drag; or hold **Space** and drag with the left button; or use the **Hand tool** and drag with the left button; or scroll (mouse wheel / two fingers on a trackpad pan in every direction).
- **Zoom**: hold **Ctrl** (⌘ on Mac) and scroll, or pinch on a trackpad. Range 10 % to 400 %. There are no on-screen zoom buttons.
- **Touch** (tablet, phone): one finger pans, pinch zooms, double-tap opens a block.

## Tools (bottom toolbar, left side)
- **Select tool** ("Select, move and lasso"): default. Drag a block to move it; drag on empty space to draw a selection rectangle (a block is selected as soon as the rectangle touches it).
- **Hand tool** ("Hand: drag to pan the canvas"): left-drag pans instead; blocks cannot be dragged while it is on. Double-click still opens a block.
- **Draw a frame** (F): see `manual-connections-and-frames`. The tool switches back to Select after the drawing, or with Esc.

## Selecting
- Click a block. **Ctrl/⌘+click** adds or removes a block from the selection. A rectangle with **Ctrl/⌘ held** selects blocks but skips frames.
- With exactly one block selected, its **floating toolbar** appears above it (Open, Download, Edit… depending on the type).
- With several selected, right-click one of them for **Selection actions** (see `manual-canvas-blocks`).

## Search this canvas — Ctrl/⌘+K (or the magnifier button in the toolbar)
Searches the **open canvas**: block titles, text in documents, table content, PDF text (including scanned pages), and audio/video transcripts once transcribed.
- Field hint: `"exact phrase"`, `-exclude`, `a OR b`.
- **Mode** selector: **Keyword** (exact words), **Auto** ("Hybrid search"), **Semantic** (describe the idea in your own words). If the semantic engine is down, a notice says "Semantic search unavailable — showing keyword results only."
- **Titles only** switch (Keyword mode only).
- **Type chips** filter by kind: Links, Images, Notes (documents), Values, Titles, PDF, Tables, Apps, Audio, Videos, Frames. **Show all** clears them.
- Empty field: a **Recent** list. No exact hit: "No exact results — showing close matches."
- ↑ / ↓ move through results, **Enter** or a click **goes to** the block (centres the canvas on it and selects it). **Ctrl/⌘+Enter** or **Ctrl/⌘+click** opens it in a window instead (blocks with no window just go to). **Alt+click** a result attaches/detaches it to Nolë (violet dashed ring). **Esc** closes. The footer of the search reminds these keys.

## Command center — Ctrl/⌘+P
Also the **Search** button of the sidebar and the ⌘ button of the toolbar. Field "Go to a canvas…". It lists **Bookmarks** (of the open canvas), **Canvases** and **Shared with me**; the open canvas is tagged "Current". Type to filter (names and descriptions match), ↑ / ↓ then **Enter**. For now it only jumps to canvases and bookmarks, it is not a general command palette.

## Bookmarks (personal saved spots) — button at bottom-right, or B
- **Create**: right-click a block → **Bookmark**; select several blocks, right-click → **Bookmark selection (n)**; right-click empty space → **Bookmark here** (saves the current view: position and zoom).
- **Use**: open the list with the bookmark button or **B**. Click a row to open the block (or fly to the spot). Row buttons: **Go to**, **Rename**, **Remove bookmark**; drag the grip ⋮⋮ to reorder. A small arrow shows in which direction a bookmark lies.
- A bookmarked block carries a small badge. Right-click it → **Remove bookmark** to undo.
- A bookmark whose block was deleted is greyed out ("This target is no longer on the canvas"); rename or remove it.
- Bookmarks belong to each person: collaborators do not see yours. They are per canvas, and also show up in the command center.

## Getting to a specific block
Window header **Navigate to node**, a mention pill in a document, a block pill in Nolë's reply, a search result, a bookmark, or **Go to** on a connection's Source / Target (right-click a connection).

One rule for mention pills, block pills in Nolë's chat and search results: **click / Enter = go to** the block on the canvas, **Ctrl/⌘+click / Ctrl/⌘+Enter = open its window** (like Ctrl/⌘+click opens a link in a new tab). A block without a window always just goes to. On a phone, tapping a block pill in the chat opens the block.

## Link to a view
**Share → Link to this view → Copy** (the Share button exists for the canvas owner only) copies a URL that opens the canvas framed exactly as on screen (see `manual-sharing-and-permissions`).

## Sync indicator (top-right cloud)
Green cloud **Synced**; yellow cloud **Saving…**; red cloud **Sync error** (check the connection and reload; see `manual-troubleshooting-and-limits`). Changes are saved continuously; there is no Save button for the canvas itself (windows have their own, see `manual-windows`).

## Canvas screen reminders
Top-left: sidebar toggle, name, ⋮ Canvas options, Undo / Redo. Bottom-right: minimized windows and Bookmarks. Bottom-left: Nolë and its task dock.
