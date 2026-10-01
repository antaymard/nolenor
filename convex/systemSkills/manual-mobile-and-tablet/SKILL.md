---
name: manual-mobile-and-tablet
description: Nolënor manual section - using Nolënor on a phone or tablet - the phone layout (top bar, Canvas / Recherche / Chat tabs, bottom toolbar, full-screen block view), touch gestures, dictation by holding the mic, what is missing on phone, how tablets behave, installing the app on the home screen and updating it. Load through nolenor-user-manual only.
hidden: true
---

# Phone, tablet and installed app

## Which layout you get
- **Screen narrower than 768 px (phones)**: a dedicated phone layout, described below.
- **Tablets and wider**: the normal desktop layout, adapted to touch (same buttons and panels as in the rest of this manual).
- The app is a web app that can be **installed** (PWA) and works in portrait or landscape.

## Phone layout
- **Top bar**: the canvas name with a ▾ (opens the **Workspaces** sheet), the sync cloud, **Share** (owner only) and the **Settings** gear.
  - **Workspaces** sheet: **All workspaces** (goes to Home), a **+** to create a workspace, the list of your workspaces (bin = delete, with confirmation "Its nodes and conversations go with it.") and **Shared with you**.
- **Bottom tabs**: **Canvas**, **Recherche** (search), **Chat** (Nolë). Each tab keeps its state when you switch.
- **Canvas tab**: the canvas plus a floating toolbar (editors only):
  - **+** ("Ajouter un bloc") opens the same **Add a node** menu as on desktop.
  - **Annuler** (undo) and **Rétablir** (redo).
  - **Dupliquer**: when exactly one block is selected. **Supprimer**: when something is selected (recoverable from Trash).
- **Recherche tab**: the same search as Ctrl+K (Keyword / Auto / Semantic, **Titles only**, **Recent** list); tap a result to open the block.
- **Chat tab**: the Nolë conversation. Top buttons: new conversation ("Nouvelle conversation") and the conversations list ("Historique des conversations", sheet **Conversations** with delete). The message box has the **Model** choice, attachments chips, and a **microphone**: **press and hold** it while speaking, release to insert the text (choose the **Dictation engine** with the button beside it). **Enter adds a line**; send with the ↑ button. Sending is blocked while a block view has unsaved changes.

## Touch gestures on the canvas
- **One finger drag** pans; **pinch** zooms.
- **Tap** selects a block. A block can only be **moved when it is selected** (tap it, then drag it).
- **Double-tap** opens the block **full screen** (the phone's "window").
- There is no long-press / right-click menu. Adding, duplicating and deleting go through the bottom toolbar; things that live in the desktop context menus (colours, layers, appearance, bookmarks, connection styling, frames, Attach to Nolë by Alt+click) are not available in the phone layout. To let Nolë use a block: select it on the canvas, then in the Chat tab tap the **+** on its dashed chip, or mention it with **@**.

## Full-screen block view (phone "window")
Top bar: back arrow, the block title, **Refresh**, **Save** (Documents and Tables are drafts until saved; closing with changes asks "Close without saving?"), and ⋯ **More options**: **Navigate to node** (goes to the block on the canvas), **History** (versions, see `manual-undo-history-trash`), **Threads that modified this node**.

## Missing on phone (use a computer)
Command center (Ctrl+P), bookmarks, minimized windows, the activity dock (find tasks on Home → **Inbox** instead), frame drawing, connection styling, keyboard shortcuts, and drag-and-drop of files (on a phone, add the block from **+** and use its **Edit** button to upload).

## Tablets
Touch-first tablets use the desktop layout with touch gestures: one finger pans, pinch zooms, double-tap opens a window; the Welcome tips show the touch versions.

## Install and update
- **Install**: use the browser menu ("Install app" / "Add to Home Screen", wording depends on the browser). The installed app opens full screen without browser bars. The app shell is cached, but canvases need a connection.
- **Update**: a banner "A new version of Nolënor is available." with **Reload** appears when a new version is ready; tap **Reload**.

See also: `manual-home-and-canvases`, `manual-nole-chat`, `manual-troubleshooting-and-limits`.
