---
name: manual-blocks-media
description: Nolënor manual section - media and file blocks - Image (carousel or grid, managing images, AI image generation with references), Audio (player, loop, transcription), Voice memo (record from the microphone), Video (player, formats, transcription), PDF/file block (reader, other file types), and the transcription feature. Load through nolenor-user-manual only.
hidden: true
---

# Image, Audio, Video and PDF/file blocks

How files become blocks: drop or paste them on the canvas (routing rules and size limits in `manual-canvas-blocks` and `manual-troubleshooting-and-limits`), or add the block first and use its **Edit** button to upload.

## Image block
- **Appearance**: **Carousel** (one picture at a time, arrows and dots on hover) or **Grid** (thumbnails; right-click → Appearance).
- **Toolbar**: **Open** (window), **Download**, **Edit** ("Manage images"), and **Generate** (play icon, "Launch image generation") once a prompt is stored.
- **Edit → "Manage images"** has two tabs:
  - **Library**: upload (several at once), drag to reorder, trash to remove, **Extract to a new node** (puts one picture in its own block), **Split all (n)** (one block per picture).
  - **Generate**: describe the picture ("Describe the image to generate…"), choose the **Model** (its price per image is shown next to its name) and how many images, then **Generate**. **Clear** empties the prompt. The dialog can be closed while it runs ("the images will land on the node"); the block shows "Generating…".
- **References**: Image blocks connected **into** the block (arrow pointing to it) are sent as reference images. A switch lets you exclude them. Some models accept none or only a few: the dialog then says how many to unplug, or to pick another model.
- One generation at a time per block. Generation costs money per image: it appears in **AI usage**. Generations are rate-limited (a few per minute).
- **Nolë can write the prompt for you but cannot start the generation**: you press **Generate** yourself.
- Several selected Image blocks can be merged (right-click → **Merge images (n)**, not undoable).

## Audio block
- Formats: mp3, m4a, wav, ogg, opus, flac, aac. Title, artist and cover art are read from the file when present. **Appearance**: **Player** or **Compact**.
- **Toolbar**: **Open** (window with the transcript), **Download**, **Edit** (upload or replace, rename: field "File name" then **Save**), **Transcribe** / **Transcript** / **Retry**, and **Clear loop** when a loop is set.
- **Player**: play / pause, seek bar, volume, playback speed ("Vitesse de lecture"), back to start ("Revenir au début").
- **Loop a passage**: while playing, press the flag "Début de la boucle ici" at the start and "Fin de la boucle ici" at the end, then the repeat button ("Activer la boucle"). **Clear loop** removes it. Nolë can set a loop if you describe the passage.

## Voice memo
- Add it from the menu: **Voice memo** ("Record a voice note from your microphone, transcribed automatically."). It is an Audio block that starts with a red microphone button, "Record a voice memo", instead of a file (in **Player** or **Compact** appearance alike).
- Click the button (the browser asks for the microphone the first time). While recording: a red dot, the elapsed time, **Stop** to save, the cross to discard.
- On **Stop** the recording is saved ("Saving…") and the block becomes a normal audio player named "Voice memo — " with the date and time (rename it with **Edit**). Uploading a file over it with **Edit** turns it into a plain Audio block. The **transcription starts on its own**; if it cannot start (rate limit), use **Transcribe** as usual.
- If the microphone is refused or missing, the message shows under the button (e.g. "Microphone access denied. Allow the microphone in your browser settings."). If saving fails, the button becomes "Retry saving the memo".
- Recording happens in the block: keep the canvas open until you press **Stop**. Nolë cannot record.

## Video block
- Formats: mp4, m4v, mov, webm, ogv, mkv, avi, wmv, flv, mpg/mpeg, 3gp. If your browser cannot play one (typically mkv, avi, wmv): "This browser cannot play this format." with **Download the file**.
- **Appearance**: **Player** or **Title** (a band with the name). **Toolbar**: **Open** (window with full controls: speed, volume, back to start, chapters), **Download**, **Edit** (upload/replace, rename), **Transcribe**.
- Nolë **cannot watch a video**. It can place it and link it, and read its transcript if you transcribed it.

## PDF / file block (labelled "PDF")
- Holds any file. **PDF** files open in a reader (double-click or **Open**): page arrows (**Previous page / Next page**), **Zoom out / Reset zoom / Zoom in**, and **Panel → Plan** shows the PDF outline when it has one.
- Other files (Word, Excel, PowerPoint, zip…) can only be **downloaded**; there is no preview. Selecting the block shows an "open in a new tab" arrow for the file.
- **Edit PDF** (pencil): upload or replace, optional title, **Save**. The text of PDFs (scans included) is searchable with Ctrl+K and readable by Nolë.

## Transcription (audio and video)
1. Select the block → **Transcribe** in its toolbar. It runs in the background ("Transcribing… 2/5", you can keep working or close the window).
2. When done the button becomes **Transcript**: it opens the window with the timestamped text (click a line to play from there), and **Panel → Plan** gives an **Overview** and **Chapters** (they appear shortly after).
3. **Re-transcribe** (window) replaces the current transcript.
- Once transcribed the content is **searchable** (Ctrl+K) and **Nolë can read it**.
- Only you can start it (a voice memo starts its own). If the file is too big the button is greyed and its tooltip says "File too large to transcribe (max … MB)"; if it fails, **Retry**. If the button is missing, transcription is not available for that file on this deployment. Transcriptions are rate-limited (a few per minute).

See also: `manual-windows`, `manual-troubleshooting-and-limits`.
