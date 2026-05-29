/**
 * Types for AI message parts (Nolë chat).
 */

export interface TextPart {
  type: "text";
  text: string;
  state: "streaming" | "done";
  providerMetadata?: Record<string, unknown>;
}
