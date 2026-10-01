---
name: manual-connections-and-frames
description: Nolënor manual section - connecting blocks with connections (creating, direction, labels, colour, thickness, style, bend points, deleting, what they are for) and grouping blocks in frames (drawing, title, colour, contents, deleting). Load through nolenor-user-manual only.
hidden: true
---

# Connections and frames

## Connections (arrows between blocks)
**What they are for**
- They show relationships (a structure, a flow of ideas). Nolë reads them as structure.
- They carry data: an **App** block reads the data of every block connected **into** it; an **Image** block uses connected Image blocks as references for generation (see `manual-blocks-link-and-app`, `manual-blocks-media`).
- Do not over-connect: not everything needs an arrow.

**Create one**
1. Select a block: small round **handles** appear on its four sides.
2. Drag from a handle onto another block (handles show up on the target while you drag) and release.
3. Or release on **empty space**: the **Add a node** menu opens and the new block is created already connected.
The arrow points **from the block you started on to the block you ended on**. Two blocks can be linked only once (in either direction), and a block cannot be linked to itself. Releasing on empty space to create a block is a desktop gesture; on a phone use the bottom bar to add blocks.

**Edit one**
- **Label**: double-click the connection, type (80 characters maximum), Enter to confirm, Esc to cancel. A short label helps when the relation is not obvious.
- **Right-click it → "Edge actions"**:
  - **Color** (same palette as blocks).
  - **Thickness**: Thin / Thick.
  - **Appearance**: Solid / Dashed / Dotted.
  - **Add point** ("n/3"): adds a bend point where you right-clicked, up to 3. Drag the point to reshape the line; right-click a point to remove it ("Drag to reshape · Right-click to remove").
  - **Remove label** (when it has one).
  - **Source** and **Target**: jump to the block at either end.
  - **Delete** the connection (undo with Ctrl/⌘+Z).
- Selecting a connection and pressing Delete also removes it.

## Frames (labelled boxes that group blocks)
**Draw one**
1. **Draw a frame** in the bottom toolbar (or press **F**; F again or **Esc** cancels).
2. Drag a rectangle around the blocks to group. Every block **fully inside** the rectangle joins it (blocks only touched at the edge do not; blocks already in another frame are left alone). An empty rectangle also works.
3. The title field opens straight away: type the name (placeholder "Untitled frame"). The tool then goes back to Select.

**Use one**
- **Move the frame** and its blocks follow.
- **Add a block**: drag it onto the frame (its centre inside the frame; the frame lights up blue). **Remove it**: drag it out. You can also ask Nolë to create blocks inside a frame.
- **Resize** with the handles of the selected frame; it cannot be made smaller than its contents.
- **Title size**: select the frame, the toolbar below it offers **Title size** H1 / H2 / H3. **Color**: right-click → Color (changes the frame's border and tint).
- Right-click works as on other blocks (Layer, Attach to Nolë, Bookmark, Delete…). A frame cannot be duplicated or copy-pasted.
- Frames cannot be nested (a frame inside a frame).
- **Delete a frame = delete everything inside it.** It all goes to the Trash together and **Restore** brings the frame back with its contents (see `manual-undo-history-trash`).
- Nolë knows frames as explicit groups. It can wrap existing blocks in a frame, but it cannot take blocks out of one.

See also: `manual-canvas-blocks` (moving, colours), `manual-canvas-navigation` (selection, F tool).
