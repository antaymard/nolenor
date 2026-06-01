import { authorize } from "./auth";
import { corsHeaders, parseList } from "./cors";
import type { Env } from "./env";
import { handleSttSession } from "./stt/relay";

const VERSION = "0.1.0";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const cors = corsHeaders(origin, parseList(env.ALLOWED_ORIGINS));

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    // Health / discovery
    if (url.pathname === "/" || url.pathname === "/health") {
      return Response.json(
        {
          ok: true,
          service: "speech-gateway",
          version: VERSION,
          endpoints: { sttRealtime: "/v1/stt/realtime (WebSocket)" },
        },
        { headers: cors },
      );
    }

    // Realtime speech-to-text (WebSocket relay)
    if (url.pathname === "/v1/stt/realtime") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return new Response("Expected a WebSocket upgrade", { status: 426, headers: cors });
      }
      const auth = authorize(request, url, env);
      if (!auth.ok) {
        return new Response(auth.reason ?? "unauthorized", {
          status: auth.status ?? 401,
          headers: cors,
        });
      }
      if (!env.MISTRAL_API_KEY) {
        return new Response("MISTRAL_API_KEY not configured", { status: 500, headers: cors });
      }
      return handleSttSession(request, env, ctx, url);
    }

    return new Response("Not found", { status: 404, headers: cors });
  },
} satisfies ExportedHandler<Env>;
