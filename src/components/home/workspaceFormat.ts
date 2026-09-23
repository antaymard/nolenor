import { formatDistanceToNow } from "@/lib/date-utils";

/** « 12 blocks », partagé par la carte et la ligne d'un canvas. */
export function formatBlocks(count: number): string {
  return `${count} ${count === 1 ? "block" : "blocks"}`;
}

/** « edited 3 hours ago ». */
export function formatEdited(updatedAt: number): string {
  return `edited ${formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}`;
}
