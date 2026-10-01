---
name: manual-home-and-canvases
description: Nolënor manual section - Home page, sidebar, creating, editing and deleting canvases (name, icon, colour, description, cover, background), the first-run screen on an empty canvas, the welcome tips, the Tutorials page. Load through nolenor-user-manual only.
hidden: true
---

# Home, sidebar and canvases

## Home page
- Greeting ("Good morning, <name>") and a subtitle: "N tasks need your attention.", "You're all caught up." or "Let's set up your first canvas."
- **Needs your attention**: Nolë's unreviewed tasks, only shown when there are some (details in `manual-nole-activity-and-inbox`).
- **Recent canvases**: every canvas the user created or received, newest edit first. A card shows the cover, icon, name, description, "N blocks · edited …", a **Shared** mark on canvases received from someone else, and a coloured "N tasks" pill when Nolë has work to review there.
  - Filter **All / Mine / Shared with me**: only appears when the user has both kinds.
  - **Grid view / List view** toggle, remembered in this browser.
  - Click a card to open it. On a card the user owns, **⋮** ("Actions for <name>", visible on hover on desktop) gives **Edit** and **Delete**. Shared canvases have no Edit / Delete.
- A **new account** automatically receives starting canvases: copies of the demo/tutorial canvases when the deployment provides them, otherwise an empty canvas named **My first canvas**. The **Welcome to Nolënor** block with **Create your first canvas** only shows when you own no canvas at all (for example after deleting them all).
- Home needs a login: signed-out visitors are sent to the sign-in page.

## Sidebar (Home, Inbox, Tutorials, and on a canvas)
- **New canvas** (violet button), **Search** (Ctrl/⌘+P: the command center, see `manual-canvas-navigation`).
- **Home**, **Inbox** (violet number = tasks waiting), **Tutorials**.
- On a canvas the list appears in the middle: **Canvases** (own, with ⋮ Edit / Delete) and **Shared with you**. Click to switch.
- Bottom: **AI usage** (cost over the last 30 days, links to Settings → AI usage) and the account menu (avatar and name → email, **Settings**, **Sign out**).
- On a canvas the sidebar is collapsed: click the sidebar toggle at the top-left. On narrow screens it slides in from a menu button.

## Create a canvas
1. **New canvas** (sidebar) — or **Create your first canvas**.
2. Dialog **Create a workspace**:
   - **Workspace name** (required).
   - **Icon & color**: "Choose an icon" (an emoji; "Paste any emoji" then **Use**) and a colour ("No color" is possible). Used for the canvas tile everywhere.
   - **Description (optional)**: helps Nolë understand what the canvas is about; Nolë reads it.
   - **Cover image (optional)** (collapsed): shown on the card on Home. PNG, JPEG, WebP, GIF or AVIF, 5 MB maximum.
   - **Background (optional)** (collapsed): pattern **Lines / Dots / Cross / None**, background colour, pattern colour, spacing and size, **Reset to default**.
3. **Create**: the new canvas opens.

## Edit or delete a canvas (owner only)
- **Edit** from: the card ⋮ on Home, the ⋮ of a canvas in the sidebar list, or the ⋮ "Canvas options" at the top-left of an open canvas. Dialog **Edit workspace**, button **Save**.
- **Settings → Canvas**: pick one of the canvases you created in the dropdown, change icon/colour, **Cover image**, **Background**, then **Save changes** ("Canvas updated — visible to everyone."). **Open canvas** jumps to it. Background and cover are the same for everyone who can see the canvas.
- **Delete**: dialog "Delete canvas?" — the canvas, its blocks and its conversations are **permanently deleted and cannot be recovered** (the Trash only covers single blocks). Suggest **Settings → Export my data** first if the user hesitates.

## First time on an empty canvas
When an editor opens a canvas with no block and no connection, a full-screen start page appears: **What's on your mind?**
- A message box to Nolë with idea chips (App prototype, Image generation, Business research, CSV visualization, Project workspace, Product launch, Decision support, Meeting notes).
- **Upload files** (PDF, images, audio, links, .csv, .md, .txt): blocks are created in the background, visible once the page is closed.
- **Start from scratch** goes to the empty canvas. Sending a message also closes the page and opens the Nolë conversation.
- Viewers never see this page.

## Welcome tips
The first time someone opens any canvas in a browser, **Welcome to Nolënor** shows three steps (**Back / Next / Got it**): with a mouse "Move around", "Open a node", "Right-click for the rest"; on touch "Move around", "Open a node", "Add and edit". It shows once per browser and does not come back.

## Tutorials page
Sidebar → **Tutorials** is a placeholder: every card ("Nolënor in two minutes", "Your first canvas", "Working with Nolë", "Tables and apps", "Connect Claude or ChatGPT", "Capture on the go", "Keyboard shortcuts") says **Coming soon**. Point to this manual instead.

## Switching canvas
Sidebar list, Home, or **Ctrl/⌘+P** then type part of the name. On a phone: the canvas name at the top opens the workspace list.

## App updates
When a new version is deployed, a banner "A new version of Nolënor is available." with **Reload** stays at the top; click it to update (unsaved window changes should be saved first).

See also: `manual-account-settings-and-data` (sign-in), `manual-mobile-and-tablet` (install as an app).
