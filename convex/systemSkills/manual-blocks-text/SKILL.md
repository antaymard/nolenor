---
name: manual-blocks-text
description: Nolënor manual section - the text-type blocks - Title (headings and labels), Document (rich-text editor called Blocknote, with slash menu, @ mentions of other blocks, callouts, date pills, Markdown download) and Value (single number, text or yes/no). Load through nolenor-user-manual only.
hidden: true
---

# Title, Document and Value blocks

## Title block — labels and headings
- A short piece of text on the canvas: section headings, labels for a group of blocks. Plain text only (no bold or lists; use a Document for that).
- **Create**: Add a block → **Title**, or press **T**. **Edit the text**: double-click it, or select it and press **Enter**; Enter confirms, Esc cancels.
- Toolbar when selected: **Style** (heading 1, 2, 3 or normal text) and **Width → Auto-fit width** (on: the block follows the text; off: drag its left/right edge to set a width and the text wraps).
- Transparent by default; colour via right-click → Color.

## Document block (labelled "Blocknote" in the Add menu, "Notes" in search)
- Rich text: headings, lists, checklists, tables, quotes, code, links, colours, images and files.
- **On the canvas** the block shows a read-only preview; it scrolls when the text is longer than the block. Empty blocks say "Double click to edit".
- **Edit**: double-click (or **Open** in the toolbar) to open the **window**. Edit, then **Save** (**Ctrl/⌘+S**) in the window header: changes are a draft until saved (see `manual-windows`). Nolë only sees saved text.
- **Toolbar**: **Open**, **Download** (saves the document as a Markdown file; some formatting such as colours does not survive Markdown).
- **Appearance** (right-click): **Preview** (content) or **Title** (just the document's name as a band).
- **In the editor**:
  - Type **/** for the block menu (headings, lists, tables, images…). Two extras: **Callout** ("Insert a colored callout with an icon") and **Date** ("Insert a date pill").
  - Type **@** to mention another block of the same canvas: a pill with its icon and title is inserted; clicking the pill opens that block (or jumps to it). The other block's **Links** tab lists its **Backlinks**.
  - Select text for the formatting toolbar; the handle to the left of a line lets you drag that paragraph elsewhere and opens its small menu.
  - **Ctrl/⌘+Enter** inserts an empty line below the current one, **Shift+Ctrl/⌘+Enter** above (handy to escape a list or table).
  - **Panel → Plan** shows the **Outline** built from your headings ("Add headings to generate the outline." when there are none).
  - **Panel → Versions** restores earlier versions (see `manual-undo-history-trash`).
- If a document cannot be read, a banner says "This document couldn't be loaded". **Do not click "Continue (delete corrupted content)"** unless the content is really lost: it deletes it permanently. Reloading the page is the first thing to try.
- Nolë can write documents block by block (insert, replace, edit a sentence). Ask it in the chat, or attach the document first (Alt+click).

## Value block — one figure
- Shows a single **text**, **number** or **Yes/No** with an optional **unit** and **label**: handy for KPIs and as a source for App blocks.
- Toolbar → **Edit value** (pencil): field **Value**, then the options **Type** (Text / Number / Yes/No), **Unit** (for example kg, $, %) and **Label**, then **Save**.
- Connect it into an App block to display or compute with it (see `manual-blocks-link-and-app`).

See also: `manual-canvas-blocks` (colour, layer, duplicate), `manual-windows`.
