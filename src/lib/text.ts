/** Lista en español: ["a"] → "a"; ["a", "b"] → "a y b"; ["a", "b", "c"] → "a, b y c". */
export function listEs(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}
