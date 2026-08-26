import { IFRAME_ZOOM_GUARD_SNIPPET } from "@/lib/browserZoomGuard";

export function buildSrcdoc(
  code: string,
  state: unknown | null,
  version: string | null,
): string {
  const serializedState = JSON.stringify(state ?? null);
  const serializedVersion = JSON.stringify(version ?? null);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.26.2/babel.min.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
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
    // storms from rendering loops.
    (function () {
      const ERROR_VERSION = ${serializedVersion};
      const FLUSH_DELAY_MS = 500;
      const buffer = [];
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
        if (flushTimer === null) {
          flushTimer = setTimeout(flush, FLUSH_DELAY_MS);
        }
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
    })();

    // Garde anti-zoom navigateur, jumeau de installBrowserZoomGuard (cf.
    // src/lib/browserZoomGuard.ts). Ici et pas dans le bloc text/babel :
    // celui-ci attend le telechargement de babel-standalone depuis le CDN.
${IFRAME_ZOOM_GUARD_SNIPPET}
  </script>
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
      } else {
        ReactDOM.createRoot(document.getElementById("root")).render(
          <div className="flex items-center justify-center p-4 text-red-500 font-mono text-sm text-center h-full w-full bg-red-50">
            ReferenceError: App is not defined.<br/>
            Make sure your code exports an App component.
          </div>
        );
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
