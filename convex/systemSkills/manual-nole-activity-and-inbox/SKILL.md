---
name: manual-nole-activity-and-inbox
description: Nolënor manual section - Nolë's tasks - the activity dock at the bottom-left of a canvas, the Needs your attention list on Home, the Inbox page and its badge, task statuses (In progress, Finished, Interrupted, No reply, Failed), marking a task as reviewed, and Nolë working while you do something else. Load through nolenor-user-manual only.
hidden: true
---

# Nolë's tasks: dock and Inbox

## Idea
Every Nolë conversation that is **running**, or that **finished but you have not looked at yet**, is a **task**. Tasks are a to-review inbox, not a history: a task stays until you **open** it or **mark it as reviewed**. Nolë works on the server, so you can close the panel, switch canvas or go do something else and come back to the result later.

## On a canvas: the activity dock
- Bottom-left, to the right of the **Nolë** button. It is empty (and invisible) when nothing needs attention.
- One **card** per task on this canvas: a status icon (animated orb while it works), the **blocks it touched** as small pills (or the conversation title), the last action in one line, and how long it took.
- **Click a card** to open that conversation in the Nolë panel. **Hover** the time: it turns into a ✓ ("Marquer comme vu" = mark as reviewed) which clears the card without opening it. A running task cannot be cleared.
- If there are too many cards for the width, a **+N** button lists the rest.

## On Home and the Inbox page
- Home → **Needs your attention** (only when there are tasks; shows up to 5, then **View all N in Inbox**). The sidebar **Inbox** entry has a violet number with the count. The page **Inbox** ("Everything Nolë did that you haven't looked at yet, across all your canvases.") shows them all.
- Each row: status icon, conversation title, the canvas it belongs to, a **status label**, one line of detail (Nolë's last action, or the failure reason), when it happened, time spent and number of blocks touched ("Blocks touched").
- **Open** takes you to that canvas with the conversation open. The ✓ button **Mark as reviewed** dismisses it (disabled with "Still running" while it works). **Clear all finished** dismisses every task that is not running.
- Dismissing in one place removes it everywhere (dock, Home, Inbox). Only tasks on canvases you can still see are listed.
- Empty state: "You're all caught up. When Nolë finishes something, it lands here until you've looked at it." On Home the canvas cards also carry an "N tasks" pill coloured by the most urgent status.

## Statuses
- **In progress** (violet): Nolë is working on it.
- **Finished** (green): done, waiting for your review.
- **Interrupted** (amber): the response was stopped.
- **No reply** (amber): the turn never completed. Resend your message to retry.
- **Failed** (red): the last response failed; the row shows the reason.

## Good to know
- Tasks come from conversations, including ones started on your phone.
- To see exactly what Nolë did in a task: open it, unfold the activity summary, or open a touched block's window → Panel → **Links → Threads**.
- The interface has no way to schedule Nolë: it works when you send a message.

See also: `manual-nole-chat`, `manual-home-and-canvases`.
