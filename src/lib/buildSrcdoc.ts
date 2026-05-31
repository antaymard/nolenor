import { parseImports } from "@/../convex/lib/appNodeImports";

/** HTML-attribute escape (for values we interpolate into srcdoc attributes). */
function htmlAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Embed a string as a JS literal that is safe inside a `<script>` element. */
function jsString(s: string): string {
  return JSON.stringify(s)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function buildSrcdoc(
  code: string,
  state: unknown | null,
  version: string | null,
): string {
  const serializedState = JSON.stringify(state ?? null);
  const serializedVersion = JSON.stringify(version ?? null);

  // Parse `// @import <name> <url>` declarations. Valid ones become ordered
  // classic <script> tags in <head> (loaded before the Babel-compiled user
  // code runs); disallowed ones are surfaced through the in-iframe error panel.
  const { imports, errors: importErrors } = parseImports(code);

  const importScripts = imports
    .map(({ url }) => {
      const onError =
        "window.__nolenorReportError&&window.__nolenorReportError(" +
        `{type:'import',message:${jsString("Échec du chargement: " + url)},timestamp:Date.now()})`;
      return `  <script src="${htmlAttr(url)}" onerror="${htmlAttr(onError)}"></script>`;
    })
    .join("\n");

  const importErrorScript =
    importErrors.length > 0
      ? `  <script>\n${importErrors
          .map(
            (e) =>
              `    window.__nolenorReportError&&window.__nolenorReportError({type:'import',message:${jsString(
                e,
              )},timestamp:Date.now()});`,
          )
          .join("\n")}\n  </script>`
      : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.2/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
${importScripts}
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script>
    // Error capture installed BEFORE Babel so syntax errors during compile of
    // the user code are reported. Debounced + deduplicated to avoid write
    // storms from rendering loops. Also drives the in-iframe error panel so a
    // failed app shows feedback instead of a blank node.
    (function () {
      const ERROR_VERSION = ${serializedVersion};
      const FLUSH_DELAY_MS = 500;
      const buffer = [];
      const collected = [];
      const seen = new Set();
      let flushTimer = null;

      function dedupKey(e) {
        return (e.type || "") + "|" + (e.message || "") + "|" + (e.stack || "");
      }

      function safeStringify(v) {
        if (typeof v === "string") return v;
        if (v instanceof Error) return v.message;
        try { return JSON.stringify(v); } catch (_) { return String(v); }
      }

      function escapeHtml(v) {
        return String(v)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }

      // Plain-DOM panel (no React/Tailwind dependency) so it renders even when
      // a CDN library — or React itself — fails to load.
      function renderErrorPanel(errors) {
        const root = document.getElementById("root");
        if (!root) return;
        const items = errors.map(function (e) {
          const loc = (e.line != null)
            ? " (" + e.line + ":" + (e.col != null ? e.col : 0) + ")"
            : "";
          return '<div style="margin-top:10px;">'
            + '<div style="font-weight:600;color:#b91c1c;">' + escapeHtml(e.type || "error") + loc + '</div>'
            + '<div style="white-space:pre-wrap;word-break:break-word;color:#7f1d1d;">' + escapeHtml(e.message || "") + '</div>'
            + '</div>';
        }).join("");
        root.innerHTML =
          '<div style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;line-height:1.5;height:100%;width:100%;overflow:auto;padding:16px;background:#fef2f2;color:#7f1d1d;box-sizing:border-box;">'
          + '<div style="font-weight:700;font-size:13px;margin-bottom:2px;">⚠️ Cette app n\\'a pas pu démarrer</div>'
          + '<div style="opacity:.75;">' + escapeHtml(errors.length) + ' erreur(s) — corrige le code et l\\'app se relancera automatiquement.</div>'
          + items
          + '</div>';
        root.__nolenorPanel = true;
      }

      // Show the panel only when the app produced no output of its own. If React
      // already rendered (incl. the ErrorBoundary's red box), we don't clobber
      // it; if we already own #root, re-render with the latest errors.
      function maybeRenderFallback() {
        if (window.__nolenorMounted) return;
        const root = document.getElementById("root");
        if (!root) return;
        if (root.childElementCount === 0 || root.__nolenorPanel) {
          renderErrorPanel(collected);
        }
      }

      function flush() {
        flushTimer = null;
        if (buffer.length === 0) return;
        const errors = buffer.splice(0, buffer.length);
        window.parent.postMessage(
          { type: "nolenor:reportErrors", __v: ERROR_VERSION, errors: errors },
          "*",
        );
      }

      function report(err) {
        if (!err || typeof err.message !== "string") return;
        const key = dedupKey(err);
        if (seen.has(key)) return;
        seen.add(key);
        buffer.push(err);
        collected.push(err);
        if (flushTimer === null) {
          flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
        }
        maybeRenderFallback();
      }

      window.__nolenorReportError = report;

      window.addEventListener("error", function (event) {
        report({
          type: "error",
          message: event.message || safeStringify(event.error),
          stack: event.error && event.error.stack ? String(event.error.stack) : undefined,
          source: event.filename,
          line: event.lineno,
          col: event.colno,
          timestamp: Date.now(),
        });
      });

      window.addEventListener("unhandledrejection", function (event) {
        const reason = event.reason;
        report({
          type: "unhandledrejection",
          message: (reason && reason.message) ? reason.message : safeStringify(reason),
          stack: reason && reason.stack ? String(reason.stack) : undefined,
          timestamp: Date.now(),
        });
      });

      const origConsoleError = console.error;
      console.error = function () {
        try { origConsoleError.apply(console, arguments); } catch (_) {}
        const args = Array.prototype.slice.call(arguments);
        report({
          type: "console.error",
          message: args.map(safeStringify).join(" "),
          timestamp: Date.now(),
        });
      };

      // Safety net: if nothing rendered and no error surfaced (e.g. a silent
      // CDN load failure), show a generic panel rather than a blank node.
      setTimeout(function () {
        if (window.__nolenorMounted) return;
        const root = document.getElementById("root");
        if (root && root.childElementCount === 0 && collected.length === 0) {
          renderErrorPanel([{
            type: "timeout",
            message: "L'app n'a produit aucun rendu (chargement d'une librairie échoué ?).",
          }]);
        }
      }, 1500);
    })();
  </script>
${importErrorScript}
  <script type="text/babel">
    const initialState = ${serializedState};

    const nolenor = {
      _request(type, payload) {
        const requestId = Math.random().toString(36).slice(2);
        return new Promise(resolve => {
          window.addEventListener("message", function handler(e) {
            if (e.data.requestId === requestId) {
              window.removeEventListener("message", handler);
              resolve(e.data.payload);
            }
          });
          window.parent.postMessage({ type, requestId, ...payload }, "*");
        });
      },
      getData()              { return this._request("nolenor:getData", {}); },
      saveState(state)       { return this._request("nolenor:saveState", { state }); },
      fetch(url, options={}) { return this._request("nolenor:fetch", { url, options }); },
    };

    class NolenorErrorBoundary extends React.Component {
      constructor(props) { super(props); this.state = { error: null }; }
      static getDerivedStateFromError(error) { return { error }; }
      componentDidCatch(error, info) {
        if (typeof window.__nolenorReportError === "function") {
          window.__nolenorReportError({
            type: "react",
            message: error && error.message ? error.message : String(error),
            stack: (error && error.stack ? error.stack + "\\n" : "") + (info && info.componentStack ? info.componentStack : ""),
            timestamp: Date.now(),
          });
        }
      }
      render() {
        if (this.state.error) {
          return (
            <div className="flex items-center justify-center p-4 text-red-500 font-mono text-sm text-center h-full w-full bg-red-50">
              {this.state.error.message || "Render error"}
            </div>
          );
        }
        return this.props.children;
      }
    }

    ${
      code.trim()
        ? code
        : `
    function App() {
      return (
        <div className="flex items-center justify-center h-full w-full bg-slate-50 text-slate-500 font-medium font-sans">
          <i>App code will be written here...</i>
        </div>
      );
    }
    `
    }

    try {
      if (typeof App !== 'undefined') {
        ReactDOM.createRoot(document.getElementById("root")).render(
          <NolenorErrorBoundary><App /></NolenorErrorBoundary>
        );
        window.__nolenorMounted = true;
      } else if (typeof window.__nolenorReportError === "function") {
        window.__nolenorReportError({
          type: "mount",
          message: "App is not defined. Make sure your code defines a component named App.",
          timestamp: Date.now(),
        });
      }
    } catch (mountError) {
      if (typeof window.__nolenorReportError === "function") {
        window.__nolenorReportError({
          type: "mount",
          message: mountError && mountError.message ? mountError.message : String(mountError),
          stack: mountError && mountError.stack ? String(mountError.stack) : undefined,
          timestamp: Date.now(),
        });
      }
      throw mountError;
    }
  </script>
</body>
</html>`;
}
