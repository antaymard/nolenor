---
name: manual-troubleshooting-and-limits
description: Nolënor manual section - limits and things that go wrong - file types and size limits, rate limits, retention periods, common error messages and what to do, reasons a shortcut or button does nothing, permission problems, features that do not exist or are not available yet. Load through nolenor-user-manual only.
hidden: true
---

# Limits and troubleshooting

## Files
- **Allowed and maximum size**: images 25 MB · audio 200 MB · video 500 MB · PDF 100 MB · Word / Excel / PowerPoint 100 MB · text, CSV, Markdown, JSON, XML 25 MB · zip / rar / 7z 200 MB. Up to 20 files per upload.
- **Refused**: SVG images, HTML files and unknown types ("This file type is not allowed."). Too big: "This file is too large." Too many: "Too many files in a single upload."
- **Canvas cover image**: PNG, JPEG, WebP, GIF or AVIF, 5 MB max.
- **Transcription**: only audio and video blocks, on demand. Files above the allowed size give a greyed **Transcribe** button with the maximum in its tooltip ("This recording is too long to be transcribed." / "This file is too large to be transcribed."); on some deployments transcription is unavailable and the button is absent.
- What each file becomes when dropped: `manual-canvas-blocks`.

## Other limits
- **Trash** and **Versions**: 30 days. A block's versions are grouped per editing session (one per 15 minutes per person).
- **Conversation memory**: the ring in the chat header fills up (amber 75 %, red 90 %): start a new conversation.
- **Agent Memory**: about 1 300 characters (user) and 2 500 (canvas).
- **Windows**: 10 minimized windows, 4 tiled at once. **Connections**: one per pair of blocks, 3 bend points each, 80-character labels. **Zoom**: 10 % to 400 %. **Account name**: 80 characters.
- **Rate limits** (per user, so nobody burns the budget by accident): Nolë messages about 30 per minute with a burst of 10; image generation about 15 per minute (burst 5); audio transcription about 10 per minute (burst 3); dictation about 60 per minute; link previews about 120 per minute; uploads about 300 per minute; sign-in code emails 3 in a row then one every 10 minutes. The error message states how long to wait: just wait and retry.
- There is **no billing, plan or quota screen**; **AI usage** only reports consumption.

## Something does not work
| Symptom | What to check |
| --- | --- |
| Red cloud **Sync error** | Connection lost or server issue. Keep the tab open, check the network, reload. Recent changes may need to be redone if they never synced. |
| "This canvas is private or unavailable" / "You are not authenticated or do not have access." | Log in with the right account; ask the owner to share the canvas (`manual-sharing-and-permissions`). |
| I can look but not change anything | You are a **Viewer** (or on a public link). Ask the owner for Editor rights. |
| **Share** button missing | Only the owner sees it. |
| A letter shortcut (T, D, I, A, L, F, N, B) does nothing | Pointer must be over the canvas, focus not in a text field, no modifier key, pressed once on its own, edit rights, desktop layout. |
| Delete key does nothing | Something other than the canvas has focus (a field, an editor), or nothing is selected, or you are a Viewer. |
| Cannot send to Nolë: "Please save or close the modified windows…" | Save (Ctrl/⌘+S) or close the windows with unsaved changes. |
| Nolë says to wait | Rate limit: wait the indicated time. |
| Conversation shows **No reply**, **Interrupted** or **Failed** | Resend the message or press **Réessayer**; if it keeps failing start a new conversation. |
| Nolë did not do what I asked | Attach the blocks or position, be specific, see `manual-nole-capabilities`. It cannot delete blocks, start image generation or transcription, or work across canvases. |
| Image: "A generation is already running on this node." | Wait for the running one. |
| Image: "This model does not accept reference images…" / too many references | Unplug or exclude reference images, or pick another model. |
| Image: "A prompt is required to generate images." | Type a prompt in the Generate tab. |
| Link block blank or refused | The site forbids embedding: use **Open in a new tab**. |
| Video does not play ("This browser cannot play this format.") | Use **Download the file**; mp4 / webm play everywhere. |
| "Semantic search unavailable" | Keyword results are shown instead; retry later. |
| Invite fails with "No user found with this email address." | The person needs a Nolënor account first. |
| Sign-in code does not arrive | Check spam, wait (email limits), retry. |
| "A new version of Nolënor is available." | Save your work, then **Reload**. |
| "This window could not be opened" / "Something went wrong" | **Reload the page**; **Back to my canvases** if needed. |
| "This canvas could not be loaded" | Reload; check your access. |
| Document says "This document couldn't be loaded" | Reload first. Do not press "Continue (delete corrupted content)" unless you accept losing it. |
| Dictation does nothing | Allow microphone access in the browser; hold Ctrl+Alt (desktop) or the mic button (phone) while speaking. |
| I cannot find a block | Ctrl/⌘+K search, the **Trash**, then a block's **Versions** / `manual-undo-history-trash`. |

## Not available
- **Recipes** and **Custom nodes / templates**: hidden in the production app.
- **Tutorials**: "Coming soon".
- No button exists for: duplicating a whole canvas, transferring ownership, leaving a shared canvas, scheduling Nolë, undoing Nolë's actions with Ctrl+Z, zoom buttons on the canvas (the PDF reader has its own), or seeing collaborators' cursors.

## If the manual does not cover it
Say so, say what you do know, and do not guess. Product topics outside the interface (pricing, where data is hosted, how models handle data, support contacts) are not documented here.
