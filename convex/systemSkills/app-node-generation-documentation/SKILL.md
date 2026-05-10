---
name: app-node-generation-documentation
description: Documentation for generating AppNode in the system, including rules, SDK usage, available data, and APIs. Must be loaded before generating or updating any AppNode.
---

# AppNode Generation documentation

When generating or updating an "app" node, you MUST follow these strict rules.

## App Node Generation Rules

You generate a single React component for an AppNode.

### Strict rules

- The component MUST be named "App"
- No "import" statements — all libs are globals
- No "export default"
- React is global: use "React.useState", "React.useEffect", etc.
- Tailwind CSS classes are available
- Chart.js is available as global "Chart"

### Mandatory workflow — ALWAYS follow this order

1. **Read source nodes first.** Before writing any code, call "readNode" on each node connected to the AppNode. This gives you the exact schema: column names, data types, field names, and sample data. Never guess or assume data shapes.
2. **Design the UI** based on the actual schema you just read. Reference the real column names and field names from step 1.
3. **Generate the component** following the mandatory pattern below.

---

## Available data & APIs

### `initialState` (injected const, sync)

Previously saved state, or `null` on first run. Available immediately at first render — no async needed. You define the format; each app has its own state shape.

---

### `nolenor.getData()` (async)

Returns all data from nodes connected via edges. No arguments needed.

```typescript
async getData(): Promise<Record<string, {
  id: string;
  type: "table" | "document" | "value" | "image" | "link" | "title" | "pdf";
  name: string;
  // --- table ---
  columns?: { id: string; name: string; type: string }[];
  // rows properties are flattened: row.annee NOT row.cells.annee
  rows?: Record<string, any>[];
  // --- document ---
  markdown?: string;
  // --- value ---
  value?: string | number;
  label?: string;
  unit?: string;
  // --- image ---
  url?: string;              // first image URL
  images?: { url: string }[]; // all images
  // --- link ---
  title?: string;
  // --- title node ---
  text?: string;
  level?: string;
  // --- pdf ---
  files?: { url: string; filename: string; mimeType?: string }[];
}>>
```

**Important**: For table rows, properties are directly on the row object. Use `row.annee`, not `row.cells?.annee`.

---

### `nolenor.saveState(state)` (async)

Persists free-form JSON. Available as `initialState` on next mount.

```typescript
async saveState(state: any): Promise<{ ok: true }>
```

---

### `nolenor.fetch(url, options?)` (async)

Makes an HTTP request proxied through the parent window. Use this to call **public external APIs**.

```typescript
async fetch(url: string, options?: RequestInit): Promise<{
  ok: boolean;
  status: number;
  statusText: string;
  data: any; // parsed JSON if response is JSON, raw string otherwise
}>
```

**Security constraints** — the following are automatically blocked and return `{ ok: false, status: 0 }`:

- `localhost` and loopback addresses (`127.x.x.x`, `0.x.x.x`)
- Private IP ranges (`10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`, `169.254.x.x`)
- Non-HTTP(S) protocols

**No API key injection is available.** All requests are made from the browser with no server-side secret. Only use public, unauthenticated endpoints, or endpoints that accept a key passed directly in the URL or headers (the user must hardcode it in the component code themselves).

Example — fetching a public JSON API:

```jsx
React.useEffect(() => {
  nolenor.fetch("https://api.example.com/data").then((res) => {
    if (res.ok) setData(res.data);
    else setError(res.statusText);
    setLoading(false);
  });
}, []);
```

Example — with headers (e.g. a user-supplied API key):

```jsx
nolenor.fetch("https://api.example.com/endpoint", {
  method: "GET",
  headers: {
    Authorization: "Bearer <API_KEY_HERE>",
  },
});
```

---

## Mandatory pattern

`nolenor.getData()` and `nolenor.fetch()` are async. You MUST:

1. Initialize UI state from `initialState` synchronously (filters, selections, toggles).
2. Fetch source data with `nolenor.getData()` (and/or `nolenor.fetch()`) in a `useEffect`.
3. Show a loading indicator until data arrives.
4. Never render the main UI before data is loaded.

```jsx
const App = () => {
  const [data, setData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);

  // State restored from previous session (sync, available immediately)
  const [filters, setFilters] = React.useState(initialState?.filters ?? []);

  // Fetch source node data (async)
  React.useEffect(() => {
    nolenor.getData().then(d => {
      setData(d);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        Chargement...
      </div>
    );
  }

  // data is guaranteed non-null below this point

  const handleFilterChange = (f) => {
    setFilters(f);
    nolenor.saveState({ filters: f });
  };

  return ( /* your UI using data and filters */ );
};
```

---

## Refresh

**Do NOT add a refresh button in the component code.** The AppNode already has a built-in refresh button in its toolbar that reloads the iframe. There is no need to replicate this inside the component.

---

## Runtime errors — debug loop

The iframe automatically reports runtime errors back to the canvas. **You do NOT write any error-capture code.** The bridge installs `window.onerror`, `unhandledrejection`, a `console.error` patch, and a React ErrorBoundary.

Errors are stored on the AppNode under `values.errors` and exposed when you `read_nodes` it. Each error has the shape:

```typescript
{
  type: "error" | "unhandledrejection" | "console.error" | "react" | "mount";
  message: string;     // truncated to 2,000 chars
  stack?: string;      // truncated to 4,000 chars
  source?: string;     // filename (uncaught errors only)
  line?: number;
  col?: number;
  timestamp: number;   // Date.now()
}
```

- Errors are deduplicated by `(type|message|stack)`, debounced ~500ms, and capped at the 10 most recent.
- When the AppNode's `code` is mutated (via `set_node_data` or `patch_app_node_code`), `values.errors` is automatically reset to `[]` and stale reports from the previous iframe version are dropped.

**Mandatory debug loop after writing or patching code:**

1. Write or patch the code.
2. Wait briefly, then `read_nodes` on the AppNode.
3. Inspect `values.errors`. If non-empty, diagnose from `type` + `message` + `stack` + `line`/`col` and patch again.
4. Repeat until `values.errors` stays empty across reads.

Don't declare the task done while errors are present.

---

## Editing existing code — `patch_app_node_code`

For **targeted edits** to an existing AppNode (a few lines, a bug fix, a small refactor), use `patch_app_node_code` instead of rewriting the whole file with `set_node_data`. It's far more token-efficient and reduces the risk of regressions.

Use `set_node_data` with `{ code }` only for the **initial generation** or a **full rewrite**.

### Workflow

1. `read_nodes` on the AppNode to get the current `values.code` exactly (whitespace matters).
2. Build a single-block patch with one or more `@@` hunks.
3. Call `patch_app_node_code` with `{ nodeId, patch, explanation }` (3-5 words for `explanation`).
4. Run the debug loop above.

### Patch format

```
*** Begin Patch
@@
 unchanged context line (prefixed with a single space)
-line to remove (must match exactly)
+line to add
 more context
@@
 context for the next hunk
+pure insertion (no `-` line needed)
*** End Patch
```

### Strict rules

- One single `*** Begin Patch` / `*** End Patch` block per call. All hunks live inside it, separated by `@@` lines.
- Every line inside a hunk MUST start with one of: `' '` (context), `'+'` (added), `'-'` (removed). No bare blank lines — an empty context line must be `" "` (a single space).
- Each hunk must contain **at least one context line** and **at least one `+` or `-` change**.
- The context + removed lines of a hunk must match the current code **exactly once** (whitespace and indentation included). If you get "no match", re-read the node — an earlier hunk in the same call may already have changed the region. If you get "multiple matches", add more context lines to disambiguate.
- Hunks are applied sequentially on the cumulative source. **All-or-nothing**: if any hunk fails (no match, multiple matches, malformed), no change is written and the tool returns a structured error pointing to the offending hunk.

### When patching fails

- Re-`read_nodes` to get fresh code (a previous patch may have shifted things).
- Increase the context window around your change.
- If the change spans many disjoint regions or rewrites a large block, fall back to `set_node_data` with the full `{ code }`.
