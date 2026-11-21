// Descarga páginas de Wikipedia mediante su API oficial y extrae sus tablas
// (class="wikitable") a JSON en data/raw/, expandiendo rowspan/colspan.
//
// Es materia prima para poblar data/cpus y data/gpus: el contenido de Wikipedia
// es CC BY-SA 4.0, así que cada ficha derivada debe citar la página en sources.
//
// Uso:  npm run fetch:wikipedia            (todas las páginas)
//       npm run fetch:wikipedia -- Raptor   (solo páginas cuyo título contenga "Raptor")
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const PAGES = [
  // CPUs
  "List of AMD Ryzen processors",
  "Coffee Lake",
  "Comet Lake",
  "Ice Lake (microprocessor)",
  "Tiger Lake",
  "Rocket Lake",
  "Alder Lake",
  "Raptor Lake",
  "Meteor Lake",
  "Arrow Lake (microprocessor)",
  "Lunar Lake",
  "Panther Lake (microprocessor)",
  "Apple silicon",
  "List of Qualcomm Snapdragon systems on chips",
  // GPUs
  "List of Nvidia graphics processing units",
  "List of AMD graphics processing units",
  "List of Intel graphics processing units",
];

const API = "https://en.wikipedia.org/w/api.php";
// Wikimedia pide un User-Agent descriptivo para clientes automatizados.
const USER_AGENT = "hardware-advisor/0.1 (open-source hardware comparison project)";
const outDir = join(fileURLToPath(import.meta.url), "..", "..", "data", "raw");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const slug = (title) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

async function fetchPage(title) {
  const url = new URL(API);
  url.search = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "text|revid",
    redirects: "1",
    format: "json",
    formatversion: "2",
  });
  let res;
  for (let attempt = 1; ; attempt++) {
    res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
    if ((res.status !== 429 && res.status < 500) || attempt === 5) break;
    const wait = (parseInt(res.headers.get("retry-after") || "", 10) || 5 * 2 ** attempt) * 1000;
    console.warn(`  … HTTP ${res.status} en "${title}", reintento ${attempt}/4 en ${wait / 1000}s`);
    await sleep(wait);
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(body.error.info);
  return body.parse; // { title, revid, text }
}

function cellText($, cell) {
  const c = $(cell).clone();
  c.find("sup.reference, style, .mw-ref, .sortkey, [style*='display:none']").remove();
  c.find("br").replaceWith(" ");
  return c.text().replace(/\s+/g, " ").trim();
}

// Convierte una tabla HTML en una grilla rectangular, repitiendo las celdas
// con rowspan/colspan en cada posición que ocupan.
function tableToGrid($, table) {
  const grid = [];
  const rows = $(table).find("> tbody > tr, > thead > tr, > tr").toArray();
  rows.forEach((tr, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const cell of $(tr).children("th, td").toArray()) {
      while (grid[r][c] !== undefined) c++;
      const rowspan = Math.min(parseInt($(cell).attr("rowspan") || "1", 10) || 1, rows.length - r);
      const colspan = Math.min(parseInt($(cell).attr("colspan") || "1", 10) || 1, 100);
      const value = { text: cellText($, cell), header: cell.tagName === "th" };
      for (let dr = 0; dr < rowspan; dr++) {
        grid[r + dr] ??= [];
        for (let dc = 0; dc < colspan; dc++) grid[r + dr][c + dc] = value;
      }
      c += colspan;
    }
  });
  return grid.filter((row) => row.length);
}

function gridToTable(grid) {
  // Filas iniciales formadas solo por <th> = encabezado (puede ser multinivel).
  let headerRows = 0;
  while (headerRows < grid.length && grid[headerRows].every((cell) => cell?.header)) headerRows++;
  const width = Math.max(...grid.map((row) => row.length));
  const headers = Array.from({ length: width }, (_, col) => {
    const parts = [];
    for (let r = 0; r < headerRows; r++) {
      const text = grid[r][col]?.text;
      if (text && parts.at(-1) !== text) parts.push(text);
    }
    return parts.join(" / ") || `col${col + 1}`;
  });
  // Encabezados repetidos (colspan) → "Nombre", "Nombre (2)", ...
  const seen = new Map();
  headers.forEach((h, i) => {
    const n = (seen.get(h) ?? 0) + 1;
    seen.set(h, n);
    if (n > 1) headers[i] = `${h} (${n})`;
  });
  const rows = grid
    .slice(headerRows)
    .map((row) => Array.from({ length: width }, (_, col) => row[col]?.text ?? ""))
    .filter((row) => row.some((v) => v) && !row.every((v) => v === row[0])); // descarta filas separadoras
  return { headers, rows };
}

function extractTables(html) {
  const $ = cheerio.load(html);
  const tables = [];
  let section = "";
  $("h2, h3, h4, table.wikitable").each((_, el) => {
    if (el.tagName !== "table") {
      section = $(el).text().replace(/\[edit\]/g, "").trim();
      return;
    }
    if ($(el).parents("table").length) return; // tablas anidadas
    const grid = tableToGrid($, el);
    if (grid.length < 2) return;
    const { headers, rows } = gridToTable(grid);
    if (!rows.length) return;
    tables.push({ section, caption: $(el).children("caption").text().trim() || null, headers, rows });
  });
  return tables;
}

const filter = process.argv[2]?.toLowerCase();
const pages = PAGES.filter((p) => !filter || p.toLowerCase().includes(filter));
if (!pages.length) {
  console.error(`Ninguna página coincide con "${process.argv[2]}".`);
  process.exit(1);
}
await mkdir(outDir, { recursive: true });

let failures = 0;
for (const [i, title] of pages.entries()) {
  if (i) await sleep(3000); // ser amables con la API
  try {
    const page = await fetchPage(title);
    const tables = extractTables(page.text);
    const file = join(outDir, `${slug(title)}.json`);
    const source = `https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(page.title.replace(/ /g, "_"))}&oldid=${page.revid}`;
    await writeFile(file, JSON.stringify({ title: page.title, source, license: "CC BY-SA 4.0", fetched: new Date().toISOString(), tables }, null, 2));
    const rowCount = tables.reduce((n, t) => n + t.rows.length, 0);
    console.log(`✔ ${page.title}: ${tables.length} tablas, ${rowCount} filas → data/raw/${slug(title)}.json`);
  } catch (e) {
    failures++;
    console.error(`✖ ${title}: ${e.message}`);
  }
}
process.exit(failures ? 1 : 0);
