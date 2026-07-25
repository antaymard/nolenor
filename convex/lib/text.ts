/** Count non-overlapping exact occurrences of `search` in `source`. */
export function countExactMatches(source: string, search: string): number {
  if (!search) return 0;
  let count = 0;
  let index = 0;
  for (;;) {
    const found = source.indexOf(search, index);
    if (found === -1) break;
    count += 1;
    index = found + search.length;
  }
  return count;
}
