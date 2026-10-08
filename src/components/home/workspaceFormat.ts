/** « 12 blocks », partagé par la carte et la ligne d'un canvas. */
export function formatBlocks(count: number): string {
  return `${count} ${count === 1 ? "block" : "blocks"}`;
}
