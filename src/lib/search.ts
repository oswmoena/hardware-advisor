// Búsqueda tolerante de chips por nombre o alias ("i7 13620h", "13620H", "rtx 4060 laptop").
export interface SearchItem {
  id: string;
  kind: "cpu" | "gpu";
  name: string;
  aliases: string[];
  /** Etiqueta corta: "Laptop", "Escritorio", "Integrada". */
  tag: string;
  release: string;
}

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, " ").trim();
const compact = (s: string) => normalize(s).replace(/ /g, "");

/** GPU que corresponde a lo escrito: nombre o alias exacto, o una única coincidencia parcial. */
export function matchGpu<T extends { name: string; aliases: string[] }>(gpus: T[], query: string): T | null {
  const q = compact(query);
  if (!q) return null;
  const names = (g: T) => [g.name, ...g.aliases].map(compact);
  const exact = gpus.find((g) => names(g).includes(q));
  if (exact) return exact;
  const partial = gpus.filter((g) => names(g).some((n) => n.includes(q)));
  return partial.length === 1 ? partial[0] : null;
}

export function searchChips(items: SearchItem[], query: string, limit = 12): SearchItem[] {
  const tokens = normalize(query).split(" ").filter(Boolean);
  if (!tokens.length) return [];
  const q = compact(query);
  const scored: [number, SearchItem][] = [];
  for (const item of items) {
    const names = [item.name, ...item.aliases].map(compact);
    const haystack = names.join(" ");
    if (!tokens.every((t) => haystack.includes(t))) continue;
    // Mejor puntaje: coincidencia exacta > prefijo > contiene; desempate por lanzamiento más reciente.
    const rank = names.some((n) => n === q) ? 0 : names.some((n) => n.startsWith(q) || n.endsWith(q)) ? 1 : 2;
    scored.push([rank, item]);
  }
  return scored
    .sort((a, b) => a[0] - b[0] || b[1].release.localeCompare(a[1].release) || a[1].name.localeCompare(b[1].name))
    .slice(0, limit)
    .map(([, item]) => item);
}
