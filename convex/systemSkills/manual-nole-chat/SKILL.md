---
name: manual-nole-chat
description: Nolënor manual section - how to use the Nolë chat panel - opening it, sending messages, conversations and history, choosing a model, voice dictation, giving Nolë context (Alt+click attach, positions, @ mentions), stopping it, statuses, errors and retry, what the activity lines mean. Load through nolenor-user-manual only.
hidden: true
---

# Talking to Nolë (chat panel)

## Open and close
- Bottom-left **Nolë** button, or press **N** with the pointer on the canvas. **✕ "Close panel"** (or N again) minimizes it. Drag the right edge of the panel to resize it (kept for next time).
- Closing the panel does **not** stop Nolë: it keeps working, and its task shows in the dock (`manual-nole-activity-and-inbox`).
- Nolë works on the canvas that is **open**. On a phone the **Chat** tab is the panel.

## Header
- Title of the conversation ("New chat" until the first message; "Untitled chat" if not titled yet).
- **Status pill**: **In progress**, **Interrupted**, **No reply** (the turn never finished: resend your message) or **Failed**.
- A small **ring** shows how full the conversation's memory is (amber above 75 %, red above 90 %). Hover for tokens per model and cost. A very long conversation is best continued in a new one.
- **+** ("Nouvelle conversation") starts a new conversation. The **conversation list** button (speech bubble with a magnifier) lists the canvas's conversations with date and status; click to open, the bin deletes one (not the open one). Older messages load with "Load more messages".

## Send a message
- Type in the box (placeholder "Ask Nolë, @ to mention a node"). **Enter** sends; **Shift+Enter** (or Ctrl/⌘+Enter) adds a line; the box grows up to 10 lines. On a phone Enter adds a line, use the ↑ send button.
- On an empty conversation, idea chips ("Research a topic", "Create an image", "Create a project tracker", "Create a Pomodoro timer"…) fill the box with a ready prompt for you to edit and send.
- Nolë answers in the language you write in, and creates canvas content in it too.
- **Stop** (square button) interrupts a running answer.
- Blocked by unsaved windows: "Please save or close the modified windows before sending your message." Save with Ctrl/⌘+S.
- Sending is rate-limited (about thirty messages a minute with a small burst): a message saying to wait means slow down.

## Give Nolë context
- **Attach a block**: **Alt+click** it on the canvas, or right-click → **Attach to Nolë**, or **Alt+click** a search result. It gets a violet dashed outline and a violet chip in the message box (✕ on the chip detaches). Attached blocks are the ones Nolë reads first.
- **Selected blocks** appear as dashed grey chips in the message box: click their **+** to attach them. With nothing there the box says "Alt + Clic on a node to attach as context".
- **Attach a position**: **Alt+click on empty canvas** adds a chip "Position (x, y)": Nolë will put new blocks there.
- **@ mention**: type **@** in the message and pick a block from the list (title and type); it becomes a pill.
- Nolë also knows which windows are open, what part of the canvas you are looking at, and the canvas structure. It cannot see your other canvases' content.
- **Files**: there is no upload button in the chat. Drop the file on the canvas (it becomes a block), then attach it.

## Voice dictation
- **Desktop**: hold **Ctrl+Alt** (the box shows "Alt + Ctrl"), speak, release: the text appears in the box ("Listening…", then "Transcription…"). Review and press Enter.
- **Phone**: hold the microphone button while speaking.
- Click the mic area to choose the **Dictation engine**: **Gladia** (custom vocabulary, French/English) or **Mistral** (Voxtral, automatic language).

## Model
**Model** (bottom-left of the box) lists the available models with a price indicator; a picture icon means it can look at images. The choice is per conversation, and the last one used is remembered. It cannot change while Nolë is answering. Costs show under **AI usage** (`manual-account-settings-and-data`).

## Reading Nolë's answers
- While it works, one live line shows the current step ("Thinking…", "Search canvas", "Create node"…) and a step count. When it finishes, the steps fold into a summary ("Read 3 nodes, edited 2") with **pills** of the blocks it created or changed. Click the summary to see each step (input and output). Click a pill to go to that block on the canvas; **Ctrl/⌘+click** opens it in a window (on a phone, a tap opens it).
- Indicators: "Nolë is thinking...", "Waiting for response...", then "Done". On failure: "La réponse a échoué." with **Réessayer**: it puts your last message back in the box, press Enter to resend.
- Nolë prefers to put results into blocks rather than long chat text: look at the canvas, and use the dock / pills to find what changed.

See also: `manual-nole-capabilities` (what to ask), `manual-nole-activity-and-inbox`, `manual-mobile-and-tablet`.
