# System skills

Skills shipped with the app and available to Nolë for every user. Each one is a folder with a `SKILL.md`
(frontmatter + Markdown body). `scripts/generateSystemSkillsRegistry.mjs` compiles them into
`_registry.generated.ts` — run `yarn gen:system-skills` after any edit (it also runs on `predev`,
`prebuild` and in CI).

## Frontmatter

```yaml
---
name: my-skill            # exact name used by load_skill; keep it equal to the folder name
description: One line.    # one line only, the parser reads `key: value` per line
hidden: true              # optional: loadable by name, but NOT listed in <available_skills>
---
```

A **hidden** skill never appears in Nolë's prompt. It is reached because a listed skill names it, so
the generator refuses a hidden skill that no listed skill mentions, duplicate names, and a reference
to an unknown skill of the same family (for example a typo in `` `manual-…` ``).

## The user manual

`nolenor-user-manual` (listed) is the entry point: vocabulary, screen map, quick facts and a table
of sections. The `manual-*` skills (hidden) are the detailed sections. Nolë loads the entry point,
then one or two sections, at most three.

It is written from the **user's point of view** (what is on screen, what to click), in English, quoting
the labels of the interface exactly. It is not documentation of the code.

| Section | Covers (source of truth in `src/`) |
| --- | --- |
| `manual-home-and-canvases` | `components/home`, `components/app-shell`, `CanvasFormModal`, `canvas/onboarding`, `canvas/welcome` |
| `manual-canvas-navigation` | `CanvasToolbar`, `CanvasFlow`, `canvas/search-modale`, `components/search`, `command-center`, `canvas-dock` |
| `manual-canvas-blocks` | `context-menus`, `hooks/useCreateNodeHotkeys`, `useCanvasContentIngest`, `nodes/prebuilt-nodes/prebuiltNodesConfig` |
| `manual-connections-and-frames` | `components/edges`, `FrameNode`, `hooks/useFrameDrawTool` |
| `manual-blocks-text` | `TitleNode`, `BlocknoteNode`, `ValueNode`, `components/blocknote` |
| `manual-block-table` | `components/table`, `windows/prebuilt/TableWindow` |
| `manual-blocks-media` | `ImageNode`, `AudioNode`, `VideoNode`, `PdfNode`, `media/TranscribeButton` |
| `manual-blocks-link-and-app` | `LinkNode`, `AppNode`, `IframeInteractionGate` |
| `manual-windows` | `components/windows` |
| `manual-undo-history-trash` | `useCanvasHistory`, `TrashModal`, `nodeDataVersions` |
| `manual-nole-chat` | `canvas/nole-panel`, `NoleCanvasPanel`, `hooks/usePushToTalk` |
| `manual-nole-activity-and-inbox` | `ActivityDock`, `TaskCard`, `components/home/Task*`, `lib/threadRunStatus` |
| `manual-nole-capabilities` | `convex/ia/tools`, `convex/ia/systemPrompts`, `convex/config/nodeConfig` |
| `manual-memory-and-skills` | `components/settings/memories`, `components/settings/skills` |
| `manual-sharing-and-permissions` | `SharingModal`, `convex/shares.ts`, `convex/lib/auth.ts` |
| `manual-account-settings-and-data` | `routes/signin`, `routes/settings`, `components/settings/{account,aiUsage,export}` |
| `manual-mcp-and-api-tokens` | `components/settings/apiTokens`, `convex/mcp` |
| `manual-mobile-and-tablet` | `components/mobile`, `useTabletMode`, PWA config in `vite.config.ts` |
| `manual-shortcuts` | every `useHotkey` / `useIsolatedHotkey` |
| `manual-troubleshooting-and-limits` | `convex/config/{uploadsConfig,errorsConfig,transcriptionConfig,trashConfig}`, `convex/lib/rateLimits.ts` |

**Keeping it true**: when a change alters a label, a shortcut, a limit or where something lives,
update the matching section in the same change. The features hidden behind `lib/featureFlags.ts`
(Recipes, Custom nodes) and placeholders (Tutorials) are listed as *not available*; move them out of
that list when they ship. Avoid hard-coding values the server decides (model names, prices).

Rules for a section: one theme, answer-first, exact UI labels in **bold** or quotes, desktop first
then what differs on phone, no invented behaviour (leave it out), roughly 1–1.5k tokens. If a
question needs more than two sections, the split is wrong.
