import { normalizeNodeId, type Value } from "platejs";
import { parseStoredPlateDocument } from "@/../convex/lib/plateDocumentStorage";

// La value stockée est du Plate JSON stringifié (même convention que les
// nodes document). Migre vers BlockNote en Phase 5 — coupure nette, pas de
// migration de données (cf. plan).
function parseRichTextDoc(value: unknown): Value | null {
  const parsed = parseStoredPlateDocument(value);
  if (!parsed || parsed.length === 0) return null;
  return normalizeNodeId(parsed as Value);
}

export { parseRichTextDoc };
