---
name: manual-account-settings-and-data
description: Nolënor manual section - signing up and in (email code, Google), password reset, signing out, the Settings area and its pages, the Account page (name Nolë uses, deleting the account), the AI usage page (cost and tokens), and exporting all data as a zip. Load through nolenor-user-manual only.
hidden: true
---

# Account, Settings, AI usage and data

## Sign up / log in (sign-in page)
- Heading **Welcome back** ("Log in to your account to continue") or **Create an account** ("Get started for free"). The link under the form switches: "Don't have an account? **Create account**" / "Already have an account? **Log in**".
- **Continue with Google**, or **email + password** (8 characters minimum) then **Log in** / **Create account**.
- **New account**: after **Create account** a page **Check your email** asks for the **6-digit code** we just sent ("We sent a verification code to your email."). Type or paste it (it submits by itself when complete), or press **Continue**. If it fails: "Invalid or expired code." If it does not arrive, check spam; code emails are limited (3 in a row, then about one every 10 minutes).
- **Forgot password?** (under the password field) → **Reset your password**: enter the email → **Send code** → **Choose a new password**: the code and the **New password** (8+ characters) → **Update password** ("Password updated!"). The "Log in" link goes back.
- Typical messages: "No account found with this email.", "Invalid email.", "Password must be at least 8 characters.", "Unable to log in. Please try again."
- After signing in you land on Home. Signed-out visitors can only see canvases shared publicly (`manual-sharing-and-permissions`).

## Sign out
Account menu (bottom of the sidebar: avatar and name) → **Sign out**, or **Settings → Account → Sign out** (asks "Sign out? You will need to log in again to get back to your canvases.").

## Settings area
Open it with the gear icon (top-right of a canvas) or the account menu → **Settings**. The arrow at the top-left of its sidebar (**Close settings**) returns to where you came from. Pages:
- **Account**: Account, AI usage, Export my data.
- **Customization**: Skills, Canvas, Agent Memory (see `manual-memory-and-skills` and `manual-home-and-canvases`). Two more pages, Custom nodes and Recipes, are hidden in the production app.
- **Developer**: MCP & API tokens (`manual-mcp-and-api-tokens`).

## Account page
- **Name**: what Nolë calls you ("How Nolë should call you", 80 characters max) then **Save** ("Name updated"). If left empty, the name from your sign-in provider is kept. The name also greets you on Home.
- **Email** and **User ID** (read-only; the ID helps support).
- **Sign out** button.
- **Danger zone** → **Delete my account**: permanently erases your canvases (every block, file and connection), your conversations and everything Nolë remembers, your skills and API tokens, and your access to canvases shared with you. You must retype your email to confirm. The dialog links to **Export your data**: do that first, nothing can be recovered afterwards. Canvases you own disappear for the people you shared them with too.

## AI usage page
- Shows what Nolë and the AI features have **consumed**; there is no plan or quota screen. The sidebar shows the same total over the last 30 days ("AI usage — Last 30 days").
- Period buttons: **7 days**, **30 days**, **90 days**, **12 months**.
- **Total cost**, **Tokens**, **LLM calls**; a chart per day (or per month for 12 months), with a table "Day (UTC): Cost, Tokens, Calls"; and **By model** (Model, Cost, Input, Output, Calls).
- Notes on the page: days are counted in **UTC**, so late-evening use in your timezone may land on the next day; a striped bar means some calls reported no cost, so the real spend is higher; input includes cached tokens, output includes reasoning tokens.

## Export my data
**Settings → Export my data**: choose **Everything** (all canvases you created, with all their nodes) or **A single canvas** (pick it in the list, "Load more canvases" if needed), then **Export**. A progress line shows "Listing canvases…", "Canvas 2 / 5 — name", "Building the archive…", then a **zip** is downloaded ("Export complete (n canvases)").
- The zip has a root README and one folder per canvas under `canvases/`: a README with the block index and connections, `canvas.json` (structure: positions, connections), `nodes.json` (raw content of every block, lossless) and a `nodes/` folder with one readable Markdown file per block (colours, alignment and advanced formatting are simplified in the Markdown; the JSON keeps everything).
- Only canvases you **created** are exported, not those shared with you.
- **Images, PDFs and audio files are not bundled**: they appear as links. Download the ones that matter while your account is still active.

See also: `manual-troubleshooting-and-limits`, `manual-home-and-canvases`.
