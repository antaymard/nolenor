import type { ChatModelOption } from "@/types/convex";

export function getModelLabel(
  value: string | undefined,
  options: readonly ChatModelOption[] | undefined,
): string {
  if (!value) return "";
  const match = options?.find((o) => o.value === value);
  return match?.label ?? value;
}

export function getModelMaxContext(
  value: string | undefined,
  options: readonly ChatModelOption[] | undefined,
): number | undefined {
  if (!value) return undefined;
  return options?.find((o) => o.value === value)?.maxContext;
}
