---
name: manual-blocks-link-and-app
description: Nolënor manual section - the Link block (one-line band, preview card, embedded page, editing the URL, pasting an iframe code) and the App block (interactive mini-apps, dashboards and calculators written by Nolë, how to use, refresh, feed data, download and change them). Load through nolenor-user-manual only.
hidden: true
---

# Link and App blocks

## Link block
- **Create**: Add a block → **Link**, press **L**, or paste / drop a web address on the canvas (the page title is fetched for you).
- **Edit** (pencil, "Edit link"): field "URL or <iframe> embed code..." (you can paste an `<iframe>` snippet from YouTube, Google Docs/Sheets/Slides and similar) and an optional "Title (optional)". Bad addresses give "Invalid URL"; if the title cannot be fetched: "Unable to fetch page title" (type it yourself).
- **Appearance** (right-click):
  - **Default**: a one-line band with the title.
  - **Preview**: a card with image and description.
  - **Embed**: the page itself is shown inside the block. Select the block and click once on the page ("Click to interact") to use it; moving the pointer away re-locks it so you can drag the block. **Refresh embed** reloads it. The embed can be resized.
- **Toolbar**: **Open** (opens the page in a window, whatever the appearance), **Copy link URL** ("Link copied to clipboard"), **Edit link**.
- Many websites refuse to be embedded (the window or embed stays blank or shows an error). The app cannot detect it: use **Open in a new tab** in the window header, or click the link.

## App block — small interactive apps
- **What it is**: a mini-application living on the canvas: dashboard, chart, calculator, timer, form, UI prototype. It runs in an isolated sandbox inside the block.
- **How to get one**: you do not write code. **Ask Nolë** ("make a dashboard of the tasks by status", "a Pomodoro timer"). An empty App block says "No app — Ask Nolë to code something". To change it later, ask Nolë again ("make it a bar chart").
- **Use it**: select the block and click on it once ("Click to use this app") to interact; leaving the block with the pointer (or Esc) locks it again so you can move it. Title bar with the app name and **Refresh app**.
- **Data**: an App reads the data of the blocks connected **into** it (arrow from the source to the App): tables, documents, values, images, links, PDFs, titles. Connect a Table to an App to chart it (see `manual-connections-and-frames`). The app keeps its own small saved state (for example a timer or typed notes), so it survives page refreshes.
- **Toolbar**: **Open** (full window "App Window", with a refresh button), **Download** ("Download code": a .jsx file of the component), **Edit app title** ("Title (optional)").
- **Appearance**: **Preview** (the app) or **Title** (a band with its name).
- **Go back to an earlier version of the app**: open the window → **Panel → Versions**. Only the app's code is versioned, not the data it saved.
- If an app misbehaves: **Refresh app** first; if the problem stays, ask Nolë to fix it and describe what you see.
- Good to know: an app only receives the data of the blocks connected to it, and it is only as good as what Nolë wrote, so describe what you want precisely.

See also: `manual-nole-capabilities` (how to ask Nolë for an app), `manual-block-table`, `manual-windows`.
