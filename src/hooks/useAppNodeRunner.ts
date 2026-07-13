import { useCallback, useMemo, useRef, useEffect } from "react";
import { useStoreApi } from "@xyflow/react";
import { useMutation } from "convex/react";
import { api } from "@/../convex/_generated/api";
import type { Id } from "@/../convex/_generated/dataModel";
import { useNodeDataStore } from "@/stores/nodeDataStore";
import { buildSrcdoc } from "@/lib/buildSrcdoc";
import {
  type SourceNode,
  resolveSourceNode,
} from "@/components/utils/appNodeUtils";

type ReportedAppError = {
  type: string;
  message: string;
  stack?: string;
  source?: string;
  line?: number;
  col?: number;
  timestamp: number;
};

type BridgeMessage =
  | { type: "nolenor:getData"; requestId: string }
  | { type: "nolenor:saveState"; requestId: string; state: unknown }
  | { type: "nolenor:fetch"; requestId: string; url: string; options: RequestInit }
  | { type: "nolenor:reportErrors"; __v: string | null; errors: ReportedAppError[] };

function isPrivateUrl(raw: string): boolean {
  let url: URL;
  try { url = new URL(raw); } catch { return true; }
  if (url.protocol !== "https:" && url.protocol !== "http:") return true;
  const h = url.hostname;
  if (h === "localhost") return true;
  const parts = h.split(".").map(Number);
  if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
    const [a, b] = parts;
    if (a === 10) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
  }
  return false;
}

export function useAppNodeRunner(
  xyNodeId: string,
  nodeDataId: Id<"nodeDatas"> | undefined,
  values: Record<string, unknown> | null | undefined,
  refreshKey: number,
) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rfStore = useStoreApi();
  const updateValuesMutation = useMutation(api.nodeDatas.updateValues);
  const reportAppErrorsMutation = useMutation(api.nodeDatas.reportAppErrors);

  const resolveConnected = useCallback(async () => {
    const { edges, nodes } = rfStore.getState();
    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const result: Record<string, SourceNode> = {};
    for (const edge of edges) {
      if (edge.target !== xyNodeId) continue;
      const sourceNode = nodeMap.get(edge.source);
      if (!sourceNode) continue;
      const sourceNodeDataId = sourceNode.data?.nodeDataId as
        | Id<"nodeDatas">
        | undefined;
      if (!sourceNodeDataId) continue;
      const nodeData = useNodeDataStore.getState().getNodeData(sourceNodeDataId);
      if (!nodeData) continue;
      result[sourceNode.id] = resolveSourceNode(nodeData, sourceNode.id);
    }
    return result;
  }, [rfStore, xyNodeId]);

  const updateState = useCallback(
    async (state: unknown) => {
      if (!nodeDataId) return;
      await updateValuesMutation({ _id: nodeDataId, values: { state } });
    },
    [nodeDataId, updateValuesMutation],
  );

  // App Node Bridge (handles messages from the iframe)
  useEffect(() => {
    const handler = async (e: MessageEvent<BridgeMessage>) => {
      if (e.source !== iframeRef.current?.contentWindow) return;

      const { type } = e.data;
      const requestId = (e.data as { requestId?: string }).requestId;
      let payload: unknown;

      if (type === "nolenor:getData") {
        payload = await resolveConnected();
      } else if (type === "nolenor:saveState") {
        // e.data.state relies on the type coercion, so we cast it quietly
        await updateState((e.data as { state: unknown }).state);
        payload = { ok: true };
      } else if (type === "nolenor:reportErrors") {
        if (!nodeDataId) return;
        const data = e.data as { __v: string | null; errors: ReportedAppError[] };
        if (typeof data.__v !== "string") return;
        if (!Array.isArray(data.errors) || data.errors.length === 0) return;
        try {
          await reportAppErrorsMutation({
            _id: nodeDataId,
            __v: data.__v,
            errors: data.errors,
          });
        } catch {
          // Best-effort: ignore reporting failures.
        }
        return;
      } else if (type === "nolenor:fetch") {
        const { url, options } = e.data as { url: string; options: RequestInit; requestId: string; type: string };
        if (isPrivateUrl(url)) {
          payload = { ok: false, status: 0, statusText: "Blocked: private or invalid URL", data: null };
        } else {
          try {
            const response = await fetch(url, options);
            const text = await response.text();
            let data: unknown;
            try { data = JSON.parse(text); } catch { data = text; }
            payload = { ok: response.ok, status: response.status, statusText: response.statusText, data };
          } catch (err) {
            payload = { ok: false, status: 0, statusText: String(err), data: null };
          }
        }
      } else {
        return;
      }

      iframeRef.current?.contentWindow?.postMessage(
        { requestId, payload },
        "*",
      );
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [resolveConnected, updateState, nodeDataId, reportAppErrorsMutation]);

  const srcdoc = useMemo(() => {
    if (!values) return "";
    const code = (values.code as string) ?? "";
    const state = values.state ?? null;
    const version = typeof values.__v === "string" ? (values.__v as string) : null;
    return buildSrcdoc(code, state, version);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values?.code, values?.__v, refreshKey]); // state exclu intentionnellement : saveState ne doit pas recharger l'iframe

  return { iframeRef, srcdoc };
}
