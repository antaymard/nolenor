---
name: manual-nole-capabilities
description: Nolënor manual section - what Nolë (the assistant) can and cannot do for the user, what it can see, how it works on the canvas, how to ask for good results (documents, tables, apps, images, research, organizing), what it never does on its own. Load through nolenor-user-manual only.
hidden: true
---

# What Nolë can do (user's point of view)

Nolë is a copilot that works **on the open canvas through real tools**: it creates and edits blocks instead of only writing chat text. The user stays in charge: Nolë can work while they edit something else, and everything it changes is versioned.

## What Nolë can do
- **Explore**: list, read and search the blocks of the open canvas (documents, tables, values, links, PDF text including scans, transcripts of audio/video you transcribed, image content). It understands the canvas layout: nearby blocks count as related, frames and titles as sections.
- **Research**: search the web and read web pages, then file the results in blocks with sources.
- **Create blocks**: Title, Link, Image (from web pictures), Document, Value, Table (with typed columns), App, and frames around existing blocks. It can place blocks next to others, connect them with labelled connections, and put new blocks inside a frame.
- **Edit blocks**: rewrite or patch a document block by block, insert/update/delete table rows, change a table's columns, set values, rename, update an App's code, set an audio loop.
- **Apps**: describe a dashboard, calculator, timer or prototype and it writes a working **App** block that reads the blocks connected to it.
- **Images**: it can write or improve the **generation prompt** of an Image block (and suggest reference images) but **you press Generate**.
- **Remember**: it keeps a short memory about you and about each canvas (see `manual-memory-and-skills`), and loads **skills** (instruction packs, yours or built-in) when a request matches.
- **Split big jobs** into helper agents when useful (you see a "Run sub-agent" step).
- **Answer in your language**, and write canvas content in it too, unless you ask otherwise.

## What Nolë cannot do
- **Delete a block or a connection** from the canvas. It can edit contents (remove paragraphs or table rows), and it cannot take a block out of a frame. You delete blocks.
- **Start an image generation or a transcription**, **upload files**, or **watch a video** (it only knows a video through its transcript, if you made one).
- **Touch other canvases.** It knows their names and descriptions only; it cannot read or edit them from here. To move something: right-click → Move to another canvas, or ask in the other canvas.
- **See unsaved edits** in an open window: save first.
- Change your settings, account, sharing or billing; invite people; read your email or files outside the canvas.
- Work when you have not sent a message (no scheduling).

## Getting good results
- **Say the result and where**: "Create a table 'Project tracker' with columns Task, Due date, Status…". It places new blocks near your attached position or blocks if you gave them.
- **Attach context**: Alt+click the blocks it should use, Alt+click empty canvas to say where, or @ mention blocks (`manual-nole-chat`).
- **For an app on data**: make sure the source blocks exist and are connected into the App block (or tell Nolë which ones), then describe what to display. Ask for changes in plain words afterwards.
- **For documents**: name audience, length and structure; later ask for targeted edits ("rewrite the second paragraph shorter").
- **Iterate**: Nolë can be corrected in a normal message. If something went wrong, use Versions or Trash (`manual-undo-history-trash`).
- **Long jobs**: let it run; progress and results are in the dock and the Inbox (`manual-nole-activity-and-inbox`).
- **Clean canvases help it**: titles, frames and nearby placement tell it what belongs together.
- Each message has a cost (see **AI usage**); the model picker lets you choose a cheaper or stronger model.

## Working at the same time
You and Nolë (and collaborators) can edit the same canvas at once. Nolë reads the latest saved state before acting; edits are versioned ("Agent" in a block's **Versions** tab) so you can go back. Your own Ctrl+Z does not undo what Nolë did.

## If the user asks about things that are not shown here
Say what you know, say what you do not know, and do not promise features. For private-data questions (where data is stored, model providers, retention beyond the 30-day Trash and Versions) say it is not covered by this manual.
