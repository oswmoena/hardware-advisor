// Convierte las tablas de Wikipedia (data/raw/, generadas por fetch-wikipedia.mjs)
// en fichas de CPU sin puntuar y las agrega a data/cpus/<marca>.json.
//
// - Las fichas que ya existen (mismo id) NO se modifican: los datos curados a mano mandan.
// - Las nuevas entran con scores en null y score_meta.method = "pending".
//
// Uso:  npm run import:cpus             (escribe los archivos)
//       npm run import:cpus -- --dry    (solo muestra qué haría)
//       npm run import:cpus -- --verbose (lista las filas omitidas y el motivo)
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatJson } from "./lib/json-format.mjs";
import { allNums, num, parseRelease, slug } from "./lib/parse.mjs";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const dry = process.argv.includes("--dry");
const verbose = process.argv.includes("--verbose");

// --- Qué tablas se importan --------------------------------------------------
// Cada regla: página (archivo en data/raw), regex de la sección, y datos que la
// tabla no trae. `release` es el año por defecto si la fila no tiene fecha.
const INTEL = [
  { file: "tiger-lake", section: /^Mobile processors \(Tiger Lake-H\)$/, platform: "mobile", arch: "Tiger Lake", release: "2021" },
  { file: "tiger-lake", section: /Tiger Lake-H35/, platform: "mobile", arch: "Tiger Lake", release: "2021" },
  { file: "tiger-lake", section: /^Mobile processors \(UP3-class\)$/, platform: "mobile", arch: "Tiger Lake", release: "2020" },
  { file: "tiger-lake", section: /^Mobile processors \(UP4-class\)$/, platform: "mobile", arch: "Tiger Lake", release: "2020" },
  { file: "rocket-lake", section: /^Rocket Lake-S/, platform: "desktop", socket: "LGA1200", arch: "Rocket Lake", release: "2021" },
  { file: "alder-lake", section: /Alder Lake-S\)$/, platform: "desktop", socket: "LGA1700", arch: "Alder Lake", release: "2022" },
  { file: "alder-lake", section: /^Alder Lake-(HX|H|P|U)$/, platform: "mobile", arch: "Alder Lake", release: "2022" },
  { file: "alder-lake", section: /^Alder Lake-N$/, platform: "mobile", arch: "Alder Lake-N (Gracemont)", release: "2023" },
  { file: "alder-lake", section: /^Twin Lake-N$/, platform: "mobile", arch: "Twin Lake (Gracemont)", release: "2025" },
  { file: "raptor-lake", section: /^Raptor Lake-S$/, platform: "desktop", socket: "LGA1700", arch: "Raptor Lake", release: "2022" },
  { file: "raptor-lake", section: /^Raptor Lake-S Refresh$/, platform: "desktop", socket: "LGA1700", arch: "Raptor Lake Refresh", release: "2023" },
  { file: "raptor-lake", section: /^Raptor Lake-(HX|H|PX|P|U)$/, platform: "mobile", arch: "Raptor Lake", release: "2023" },
  { file: "raptor-lake", section: /^Raptor Lake-(HX|U) Refresh$/, platform: "mobile", arch: "Raptor Lake Refresh", release: "2024" },
  { file: "raptor-lake", section: /^Raptor Lake-(H|U) Re-refresh$/, platform: "mobile", arch: "Raptor Lake Refresh", release: "2025" },
  { file: "meteor-lake", section: /^Meteor Lake-(H|U)$/, platform: "mobile", arch: "Meteor Lake", release: "2023" },
  { file: "arrow-lake-microprocessor", section: /^Arrow Lake-S$/, platform: "desktop", socket: "LGA1851", arch: "Arrow Lake", release: "2024" },
  { file: "arrow-lake-microprocessor", section: /^Arrow Lake-(HX|H|U)$/, platform: "mobile", arch: "Arrow Lake", release: "2025" },
  { file: "lunar-lake", section: /^Mobile processors$/, platform: "mobile", arch: "Lunar Lake", release: "2024" },
];

const RYZEN = "list-of-amd-ryzen-processors";
const AMD = [
  { section: /^Vermeer \(5000 series/, platform: "desktop", socket: "AM4" },
  { section: /^Cezanne \(5000 series/, platform: "desktop", socket: "AM4", release: "2021" },
  { section: /^Raphael \(7000 series/, platform: "desktop", socket: "AM5" },
  { section: /^Phoenix \(8000 series/, platform: "desktop", socket: "AM5" },
  { section: /^Granite Ridge \(9000 series/, platform: "desktop", socket: "AM5" },
  { section: /^Gorgon Point AM5/, platform: "desktop", socket: "AM5" },
  { section: /^Lucienne/, platform: "mobile", release: "2021" },
  { section: /^Cezanne and Barceló/, platform: "mobile" },
  { section: /^Rembrandt/, platform: "mobile" },
  { section: /^Mendocino/, platform: "mobile" },
  { section: /^Barcelo-R/, platform: "mobile" },
  { section: /^Phoenix \(7040 series/, platform: "mobile" },
  { section: /^Dragon Range/, platform: "mobile" },
  { section: /^Hawk Point/, platform: "mobile", release: "2024" },
  { section: /^Fire Range/, platform: "mobile" },
  { section: /^Strix (Point|Halo)/, platform: "mobile" },
  { section: /^Gorgon (Point|Halo) \(/, platform: "mobile" },
].map((rule) => ({ ...rule, file: RYZEN }));

// --- Utilidades de parseo ---------------------------------------------------
const coresOf = (s) => {
  const m = String(s ?? "").match(/(\d+)\s*(?:\((\d+)\))?/);
  return m ? { cores: Number(m[1]), threads: Number(m[2] ?? m[1]) } : null;
};

// Busca columnas por patrón. `isE` excluye columnas de núcleos de eficiencia/compactos.
const isECol = (h) => /\/ (E|LP-E)( |$)|Zen ?\dc|\(Zen ?\dc\)/.test(h);
const isGpuCol = (h) => /GPU|Graphics|Xe|CU/.test(h);
const cols = (headers, test) => headers.map((h, i) => [h, i]).filter(([h]) => test(h)).map(([, i]) => i);

function rowToCpu(headers, row, rule, brand, source) {
  const get = (i) => (i === undefined ? undefined : row[i]);
  const first = (test) => get(cols(headers, test)[0]);

  // Nombre
  const clean = (s) => String(s ?? "").replace(/\[[^\]]*\]/g, "").replace(/\(PRO\)\s*/gi, "").replace(/\s+/g, " ").trim();
  const branding = clean(first((h) => /branding/i.test(h) && !/\(2\)/.test(h)));
  // "1235U (with IPU)": algunos modelos solo aparecen con este sufijo; si el modelo base
  // también está, ambos generan el mismo id y se deduplican.
  const model = clean(first((h) => /^(Model|SKU)( |$)|branding and model \(2\)/i.test(h))).replace(/\s*\(with IPU\)/i, "");
  if (!branding || !model || /^(—|-|n\/a)/i.test(model)) return { skip: "sin nombre" };
  const name = /^Core i\d$/.test(branding) ? `${branding}-${model}` : `${branding} ${model}`;

  // Núcleos
  const totalCol = cols(headers, (h) => /cores/i.test(h) && /total/i.test(h))[0];
  const pCol = cols(headers, (h) => /cores/i.test(h) && (/\/ P( |$)/.test(h) || /\/ Zen ?\d\+?( |$)|\/ Zen 2\/3\+\/4\/5/.test(h)))[0];
  const eCols = cols(headers, (h) => /cores/i.test(h) && isECol(h));
  const singleCol = cols(headers, (h) => /cores/i.test(h) && !isGpuCol(h))[0];
  let performance, efficiency = 0, threads = 0;
  if (pCol !== undefined) {
    const p = coresOf(get(pCol));
    if (!p) return { skip: "núcleos ilegibles" };
    performance = p.cores;
    threads = p.threads;
    for (const c of eCols) {
      const e = coresOf(get(c));
      if (e) { efficiency += e.cores; threads += e.threads; }
    }
    const total = coresOf(get(totalCol));
    if (total) threads = total.threads; // la columna total es la más confiable
  } else {
    const c = coresOf(get(totalCol ?? singleCol));
    if (!c) return { skip: "núcleos ilegibles" };
    performance = c.cores;
    threads = c.threads;
  }

  // Relojes: base = máximo entre columnas "base" de núcleos P; boost = máximo entre turbo/boost.
  const clockVals = (test) => cols(headers, (h) => test(h) && !isECol(h) && !isGpuCol(h) && !/all.?core|active cores \/ [2-9]|\/ All( |$)/i.test(h))
    .map((i) => num(row[i])).filter((v) => v && v < 10);
  const base = Math.max(...clockVals((h) => /base/i.test(h) && /clock|freq|GHz/i.test(h) && !/^Power/i.test(h)), 0) || undefined;
  const boost = Math.max(...clockVals((h) => /turbo|boost|max turbo/i.test(h)), 0) || undefined;

  // Potencia ("Base freq at TDP / @35 W" es un reloj, no una potencia)
  const tdpCols = cols(headers, (h) => (/TDP|PL1|PL2|^Power \//i.test(h)) && !/freq|clock/i.test(h));
  const notBase = (h) => /turbo|PL2|down|^TDP \/ cTDP/i.test(h);
  const baseTdpCol =
    tdpCols.find((i) => !notBase(headers[i]) && /base|PL1|^TDP( \(cTDP\))?$/i.test(headers[i])) ??
    tdpCols.find((i) => !notBase(headers[i]));
  const baseW = num(get(baseTdpCol));
  const maxW = Math.max(...tdpCols.flatMap((i) => allNums(row[i])), 0) || undefined;

  // Lanzamiento y NPU
  const release = parseRelease(first((h) => /release|launch/i.test(h) && !/price/i.test(h))) ?? rule.release;
  if (!release) return { skip: "sin fecha de lanzamiento" };
  const npu = num(first((h) => /NPU/i.test(h)));

  const brandKey = brand.toLowerCase();
  const nameSlug = slug(name).replace(new RegExp(`^${brandKey}-`), ""); // "Intel Processor N100" → "processor-n100"
  const aliases = new Set();
  const intelProc = name.match(/^Intel Processor (.+)$/);
  if (intelProc) [intelProc[1], `Processor ${intelProc[1]}`].forEach((a) => aliases.add(a));
  const iCore = name.match(/^Core (i\d)-(.+)$/);
  if (iCore) ["{i}-{m}", "{i} {m}", "Core {i} {m}"].forEach((p) => aliases.add(p.replace("{i}", iCore[1]).replace("{m}", iCore[2])));
  const ryzen = name.match(/^Ryzen (\d) (.+)$/);
  if (ryzen) aliases.add(`R${ryzen[1]} ${ryzen[2]}`);
  if (/^Core Ultra /.test(name)) aliases.add(name.replace(/^Core /, ""));

  const cpu = {
    id: `${brandKey}-${nameSlug}`,
    brand,
    name,
    aliases: [...aliases].filter((a) => a !== name),
    platform: rule.platform,
    isa: "x86",
    release,
    architecture: rule.arch ?? amdArch(rule.sectionText),
    cores: { performance, efficiency, threads: Math.max(threads, performance + efficiency) },
  };
  if (base || boost) cpu.clocks_ghz = { ...(base && { base }), ...(boost && { boost }) };
  if (baseW) cpu.power_w = { base: baseW, ...(maxW && maxW > baseW && { max: maxW }) };
  cpu.socket = rule.platform === "desktop" ? rule.socket : null;
  if (npu) cpu.npu_tops = npu;
  cpu.spec_sources = [source];
  cpu.scores = { single: null, multi: null };
  cpu.score_meta = { method: "pending" };
  return { cpu };
}

// "Raphael (7000 series, Zen 4/RDNA2 based)" → "Zen 4 (Raphael)"
function amdArch(section) {
  const codename = section.split(" (")[0].trim();
  const zen = section.match(/Zen ?(\d)(\+?)/);
  return zen ? `Zen ${zen[1]}${zen[2]} (${codename})` : codename;
}

// --- Importación ------------------------------------------------------------
async function importBrand(brand, rules) {
  const file = join(root, "data", "cpus", `${brand.toLowerCase()}.json`);
  const existing = JSON.parse(await readFile(file, "utf8"));
  const byId = new Map(existing.map((c) => [c.id, c]));
  const aliasOwner = new Map(existing.flatMap((c) => [c.name, ...c.aliases].map((a) => [slug(a), c.id])));
  const stats = { added: 0, kept: 0, skipped: {} };
  const raws = new Map();

  for (const rule of rules) {
    if (!raws.has(rule.file)) raws.set(rule.file, JSON.parse(await readFile(join(root, "data", "raw", `${rule.file}.json`), "utf8")));
    const raw = raws.get(rule.file);
    const tables = raw.tables.filter((t) => rule.section.test(t.section));
    if (!tables.length) console.warn(`  ! ${rule.file}: ninguna tabla coincide con ${rule.section}`);
    for (const table of tables) {
      for (const row of table.rows) {
        const { cpu, skip } = rowToCpu(table.headers, row, { ...rule, sectionText: table.section }, brand, raw.source);
        if (skip) {
          stats.skipped[skip] = (stats.skipped[skip] ?? 0) + 1;
          if (verbose) console.log(`  - omitida (${skip}) [${table.section}]: ${row.slice(0, 3).join(" | ")}`);
          continue;
        }
        if (byId.has(cpu.id)) { stats.kept++; continue; }
        cpu.aliases = cpu.aliases.filter((a) => !aliasOwner.has(slug(a)));
        if (aliasOwner.has(slug(cpu.name))) { stats.skipped["nombre duplicado"] = (stats.skipped["nombre duplicado"] ?? 0) + 1; continue; }
        for (const a of [cpu.name, ...cpu.aliases]) aliasOwner.set(slug(a), cpu.id);
        byId.set(cpu.id, cpu);
        stats.added++;
      }
    }
  }

  const list = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
  if (!dry) await writeFile(file, formatJson(list));
  const skipped = Object.entries(stats.skipped).map(([k, v]) => `${v} ${k}`).join(", ") || "ninguna";
  console.log(`${dry ? "[dry] " : ""}${brand}: ${stats.added} nuevas, ${stats.kept} ya existían, filas omitidas: ${skipped} → ${list.length} en total`);
}

await importBrand("Intel", INTEL);
await importBrand("AMD", AMD);
