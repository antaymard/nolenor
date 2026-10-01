---
name: manual-memory-and-skills
description: Nolënor manual section - teaching Nolë things that last - Settings → Agent Memory (what Nolë remembers about the user and about each canvas, size limits, editing) and Settings → Skills (writing custom skills with name, description, body and attachments). Also says that Recipes and Custom nodes are not available. Load through nolenor-user-manual only.
hidden: true
---

# Agent Memory and Skills (Settings)

Open **Settings** (gear icon top-right on a canvas, or account menu at the bottom of the sidebar). Both pages are under **Customization**; the Settings sidebar also lists **Canvas** (see `manual-home-and-canvases`).

## Agent Memory — what Nolë remembers
- Page **Agent Memory**. Two editable notes:
  - **User memory**: "What Nolë remembers about you across all canvases" (your role, preferences, how you like answers).
  - **Canvas memory**: "What Nolë remembers about this canvas." Pick the canvas in the dropdown ("Select a canvas"; only canvases **you created** are listed; "Load more canvases" when there are many). Good for conventions ("blue blocks = validated"), current focus, meaning of hubs.
- **One line = one memory.** Empty lines are ignored. A counter shows "% — n/max chars" (user memory about 1 300 characters, canvas memory about 2 500). Over the limit you cannot save until you shorten it ("exceeds the limit by n chars"). **Save** stores it ("User memory saved.").
- **Nolë writes to it too**: ask it in the chat ("remember that I prefer short answers", "forget that"), and it updates these notes by itself when it learns something lasting. Check the page to see or fix what it stored.
- Nolë is given its memory with every message, so a change applies from your next message. User memory is personal to each account; canvas memory belongs to the canvas, and only its owner can edit it from this page.
- To make Nolë forget something, delete the line and **Save**.

## Skills — your own instruction packs
A **skill** is a reusable set of instructions that Nolë loads **on demand** when a request matches it (for example "how I write meeting notes", "my research checklist").
- **Settings → Skills** ("Reusable prompt modules Nolë can load on demand."). List on the left ("No skills yet." at first), editor on the right (on a phone use **All skills** to go back).
- **New skill**, then fill:
  - **Name**: a short identifier without spaces (placeholder "e.g. my_skill"). Required. Nolë loads it by this exact name.
  - **Description**: one short sentence saying *when* to use it ("Short description used to match this skill"). This is what Nolë reads to decide whether to load the skill, so write it like a trigger: "Use when the user asks for meeting notes".
  - **Content**: the full instructions, written in Markdown ("The body is the full prompt loaded by Nolë."): what to do, in which order, what the result should look like.
  - **Save** ("Skill created." / "Skill saved."). **Delete** asks for confirmation and cannot be undone.
- **Attachments** (appear once the skill is saved): **Add attachment** with a **Name** (for example extractor.py), a **Type** (Markdown, Plain text, Python script, TypeScript script) and pasted **Content**. They are reference files Nolë can read on demand when the skill's body mentions them by name. **Remove** deletes one.
- Skills are **personal**: they apply in all your canvases and are not shared with collaborators. Nolë also has built-in skills (you do not see them here) that it uses by itself, for example for writing Apps and for this manual.
- Tips: keep one purpose per skill; give an example of the expected output; mention attachment names in the body if Nolë should read them.

## Not available
- **Recipes** and **Custom nodes (templates)** exist in the code but are hidden in the production app; do not tell the user to look for them.

See also: `manual-nole-chat`, `manual-nole-capabilities`.
