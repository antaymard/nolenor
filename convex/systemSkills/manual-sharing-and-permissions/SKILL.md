---
name: manual-sharing-and-permissions
description: Nolënor manual section - sharing a canvas - the Share dialog (public link, link to a view, inviting people by email as Viewer or Editor, removing access), what Owner, Editor and Viewer can each do, collaborating live, what a signed-out visitor sees on a public canvas, shared canvases in the lists. Load through nolenor-user-manual only.
hidden: true
---

# Sharing and permissions

## Share dialog (owner only)
The **Share** button is at the top-right of a canvas (also in the phone top bar). It exists **only for the canvas owner**. Dialog **Share canvas**, top to bottom:
1. **Public link** switch: "Anyone with the link can view this canvas." ("Canvas is now public." / "Canvas is now private."). When on, **Copy link** copies the canvas address.
2. **Link to this view** → **Copy**: a link that opens the canvas framed exactly as you see it now (position and zoom).
3. **Invite by email**: field **Email**, **Permission** (**Viewer** or **Editor**), button **Share**.
4. **Shared with**: the people who have access (name, email, permission). The bin button (**Remove access**) removes one.

Rules for inviting:
- The person **must already have a Nolënor account** with that email ("No user found with this email address."). Ask them to sign up first, then invite again.
- You cannot invite yourself ("You cannot share with yourself.").
- Inviting the same email again **changes** their permission. They receive an email notification, and the canvas appears in their **Shared with you / Shared with me** lists (Home, sidebar, command center) with a **Shared** mark.
- To stop sharing: **Remove access** for a person, or switch **Public link** off.

## What each role can do
| | Owner (creator) | Editor | Viewer |
| --- | --- | --- | --- |
| Look, pan, zoom, open windows, bookmarks | yes | yes | yes |
| Add / edit / move / delete blocks, connections, frames, tables, documents | yes | yes | no |
| Message Nolë, generate images, transcribe | yes | yes | no (Nolë cannot be used) |
| Undo, Trash | yes | yes | no |
| Share, public link, remove access | yes | no | no |
| Edit name, icon, cover, background; delete the canvas; edit canvas memory | yes | no | no |

- A viewer does not get the start page on an empty canvas either.
- **Personal things stay personal**: each person has their own Nolë conversations, bookmarks, user memory, undo history and Inbox. What is shared is the canvas content itself.
- There is no "leave this canvas" button and no ownership transfer: ask the owner to remove your access.

## Collaborating
Changes appear live for everyone on the canvas, and Nolë can edit at the same time as people. Changes saved in a window show to others; an unsaved draft stays on the person's own screen until they save (`manual-windows`). Version history records "User" and "Agent" edits per block (`manual-undo-history-trash`).

## Without an account (public canvas)
Opening a public link needs no login: the canvas is **read-only**. A banner at the top says "Viewing a public canvas — Log in or create an account to duplicate, edit, and keep your own workspaces." with **Log in / Create account**. If the link is to a private canvas (or one that does not exist) the page says "This canvas is private or unavailable" with **Log in / Create account** and **Back to my canvases**. Signed-out visitors have no sidebar and no Nolë.

## Good to know
- Making a canvas public exposes all its content to anyone with the link. Switch it off to stop.
- The background and cover of a canvas are the same for everyone who can see it.
- Viewers who open a **Link to this view** land on the framed spot, useful to point at one area of a large canvas.

See also: `manual-account-settings-and-data` (accounts), `manual-troubleshooting-and-limits` (errors).
