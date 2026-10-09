---
name: manual-canvas-blocks
description: Nolënor manual section - adding blocks (Add a block menu, letter shortcuts, drag and drop, paste), moving, alignment guides (Shift), align / distribute / tidy up, resizing, colours, layers, appearance, duplicating, copy/paste, deleting, moving a block to another canvas, copying block IDs, attaching a block to Nolë. Load through nolenor-user-manual only.
hidden: true
---

# Working with blocks on the canvas

Everything here needs edit rights (owner or Editor). A Viewer can look, open and search but not change anything (see `manual-sharing-and-permissions`).

## Add a block
- **+ "Add a block"** (bottom toolbar) opens the menu **Add a node**: a search field ("Search a node") and the block types, each with a one-line description and its shortcut. Arrow keys / Tab / Enter work in the menu. The block lands in the middle of the view.
- **Right-click the empty canvas**: same menu, the block lands where you clicked (the menu also offers **Bookmark here**).
- **Letter shortcuts**, pointer over the canvas, no modifier, pressed alone: **T** Title, **D** Document (Blocknote), **I** Image, **A** Table, **L** Link. The block appears with its top-left corner at the pointer. Typing a sentence while the canvas has focus does not create blocks, and nothing happens while a text field has focus.
- Block types in the menu: **Title, Link, Image, Blocknote (document), Value, PDF, Table, App, Audio, Video**. Frames are drawn (see `manual-connections-and-frames`), not added from the menu.
- From a connection: drag a connection from a block and release on empty space to get the same menu, with the new block already connected.
- **Ask Nolë**: it can create and fill blocks for you (see `manual-nole-capabilities`).

## Import by dropping or pasting
- **Drop files** on the canvas (an overlay says "Déposez pour créer un node") or **paste** (Ctrl/⌘+V). Several files become a grid of blocks (four per row).
  - image → **Image**; audio → **Audio**; video → **Video**; `.csv` → **Table**; `.md` / `.markdown` / `.txt` → **Document**; anything else (PDF, Word, Excel, PowerPoint, zip…) → **PDF** block, which stores any file. Only real PDFs open in a reader.
  - A pasted **image URL** → Image. A pasted **web address** → Link (the page title is fetched). Other pasted **text** → Document.
- Size and type limits: see `manual-troubleshooting-and-limits`.

## Move, resize, arrange
- **Move**: drag the block (Select tool). Hold **Ctrl/⌘ while dragging** to carry along the blocks it points to (its downstream connections).
- **Alignment guides**: hold **Shift while dragging** one block or a selection, and it snaps to the blocks visible on screen: their edges and centres (red lines with small crosses), and equal spacing, either halfway between two neighbours or continuing a row with the same gap (pink lines with the gap value). Shift can be pressed or released mid-drag. Without Shift, blocks move freely and no guide shows.
- **Align and distribute**: right-click a selection of blocks, see "Selection actions" below.
- **Resize**: select the block, drag the small square handles on its border. Some types are fixed-size or only resize in some appearances.
- **Layer** (right-click → Layer): **Bring to front / Bring forward / Send backward / Send to back**. Useful when blocks overlap.
- Dragging a block onto a frame puts it inside; dragging it out takes it out (see `manual-connections-and-frames`).

## Right-click a block: "Block actions"
- **Appearance**: switches the display style of that type (Link: Default / Preview / Embed; Image: Carousel / Grid; Document and Table and App: Preview / Title; Audio: Player / Compact; Video: Player / Title). It also resets the block to that style's standard size.
- **Color**: Default, Transparent, Red, Orange, Yellow, Lime, Green, Teal, Sky, Blue, Purple, Pink (names appear on hover).
- **Layer** (above).
- **Attach to Nolë / Detach from Nolë** (**Alt+click** on the block does the same): marks the block with a violet dashed outline and adds it to the next message as context (see `manual-nole-chat`).
- **Bookmark / Remove bookmark** (see `manual-canvas-navigation`).
- **Duplicate** (**Ctrl/⌘+D**): creates a copy of the block and its content. Its connections are not copied.
- **Copy ID → Node ID / Canvas & node ID**: copies an identifier, used to point an external MCP client at this block (see `manual-mcp-and-api-tokens`).
- **Move to another canvas**: dialog "Move node to another canvas": pick the destination, confirm. With no other canvas it says "No other canvas available."
- **Delete**.

## Right-click several selected blocks: "Selection actions"
- **Align & distribute** (submenu): **Align left / Align horizontal centers / Align right**, **Align top / Align vertical centers / Align bottom** (relative to the outer edges of the selection, like in Figma), **Distribute horizontally / Distribute vertically** (equal gaps, the two outermost blocks stay put, needs 3+ blocks), **Tidy up** (puts a row, a column or a regular grid back in order: one gap across, one gap down, based on the current gaps). An action that would change nothing is greyed out.
- **Suggested actions**: when the selection looks like a row, a column or a grid, the most useful of these appear directly at the top of the menu (row: **Align top**, **Distribute horizontally**, **Tidy up**; column: **Align left**, **Distribute vertically**, **Tidy up**; grid: **Tidy up**). A scattered selection gets no suggestion.
- Blocks keep their frame. Locked and hidden blocks do not move; blocks inside a selected frame move with the frame. One **Ctrl/⌘+Z** undoes the whole action.

The rest of the menu: **Appearance** (styles common to all selected), **Color**, **Layer**, **Merge images (n)** (appears when 2+ Image blocks are selected: all their pictures go into the top-left one and the others are deleted; this one cannot be undone with Ctrl+Z), **Attach to Nolë**, **Bookmark selection**, **Duplicate**, **Delete selection**.

## Floating toolbar
With one block selected, a small toolbar floats above it with the actions of its type (**Open**, **Download**, **Edit**, **Generate**, **Transcribe**…). They are described per type in the block sections (`manual-blocks-text`, `manual-block-table`, `manual-blocks-media`, `manual-blocks-link-and-app`).

## Copy, paste, delete
- **Ctrl/⌘+C** copies the selected blocks inside the app; **Ctrl/⌘+V** pastes them at the pointer. If your system clipboard holds files or text, that content is pasted instead. Frames cannot be copied or duplicated.
- **Delete** or **Backspace** (canvas focused, not typing) deletes the selection, with no confirmation. Its connections go with it. Deleting a **frame deletes everything inside it**.
- **Undo** with Ctrl/⌘+Z; or restore from **Trash** (top-right, 30 days): see `manual-undo-history-trash`.

## Who can see what
Changes show live to everyone on a shared canvas. Nolë can edit at the same time as you.
