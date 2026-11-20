// Utilidades de parseo compartidas por los importadores de tablas de Wikipedia.

/** Primer número de un texto ("4.9 GHz" → 4.9, "1,512" → 1512), o null. */
export const num = (s) => {
  const m = String(s ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/** Todos los números de un texto ("35–115 W" → [35, 115]). */
export const allNums = (s) => (String(s ?? "").replace(/,/g, "").match(/\d+(\.\d+)?/g) || []).map(Number);

export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Quita anotaciones de Wikipedia ("[dead link]", "[a]") y espacios repetidos. */
export const clean = (s) => String(s ?? "").replace(/\[[^\]]*\]/g, "").replace(/\s+/g, " ").trim();

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "Jan 10, 2023" → "2023-01"; "Q4'23" → "2023"; "2024" → "2024"; sin año → null. */
export function parseRelease(s) {
  const text = String(s ?? "").toLowerCase();
  const quarter = text.match(/q[1-4]\s*'(\d\d)/);
  const year = text.match(/\b(20\d\d)\b/)?.[1] ?? (quarter ? `20${quarter[1]}` : null);
  if (!year) return null;
  const month = MONTHS.findIndex((m) => new RegExp(`\\b${m}`).test(text));
  return month >= 0 ? `${year}-${String(month + 1).padStart(2, "0")}` : year;
}
