// Convierte las tablas de Wikipedia (data/raw/) en fichas de GPU dedicadas sin puntuar
// y las agrega a data/gpus/<marca>.json. En fichas existentes solo completa pcie, fp32_tflops
// y spec_sources si faltan; nunca modifica lo que ya está.
//
// Uso:  npm run import:gpus [-- --dry] [-- --verbose]
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { formatJson } from "./lib/json-format.mjs";
import { allNums, clean, num, parseRelease, slug } from "./lib/parse.mjs";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const dry = process.argv.includes("--dry");
const verbose = process.argv.includes("--verbose");

const NV = "list-of-nvidia-graphics-processing-units";
const AMD = "list-of-amd-graphics-processing-units";
const INTEL = "list-of-intel-graphics-processing-units";

// `occurrence`: algunas páginas repiten el nombre de sección (escritorio y luego laptop).
const RTX = (upscaling, fg) => ({ ray_tracing: true, upscaling, frame_generation: fg });
const NO_RT = (upscaling, fg) => ({ ray_tracing: false, upscaling, frame_generation: fg });
const RULES = [
  // 2019 en adelante: Turing (GTX 16 y RTX 20) y RDNA 1 (RX 5000)
  { brand: "NVIDIA", file: NV, section: /^GeForce GTX 16 series$/, occurrence: 1, type: "desktop", arch: "Turing", features: NO_RT([], false) },
  { brand: "NVIDIA", file: NV, section: /^GeForce 16 series$/, occurrence: 1, type: "mobile", arch: "Turing", features: NO_RT([], false) },
  { brand: "NVIDIA", file: NV, section: /^GeForce RTX 20 series$/, occurrence: 1, type: "desktop", arch: "Turing", features: RTX(["DLSS"], false) },
  { brand: "NVIDIA", file: NV, section: /^GeForce RTX 20 series$/, occurrence: 2, type: "mobile", arch: "Turing", features: RTX(["DLSS"], false) },
  { brand: "AMD", file: AMD, section: /^Radeon RX 5000 series$/, occurrence: 1, type: "desktop", arch: "RDNA 1", features: NO_RT(["FSR"], true) },
  { brand: "AMD", file: AMD, section: /^Radeon RX 5000M series$/, occurrence: 1, type: "mobile", arch: "RDNA 1", features: NO_RT(["FSR"], true) },
  { brand: "NVIDIA", file: NV, section: /^GeForce RTX 30 series$/, occurrence: 1, type: "desktop", arch: "Ampere", features: RTX(["DLSS"], false) },
  { brand: "NVIDIA", file: NV, section: /^GeForce RTX 40 series$/, occurrence: 1, type: "desktop", arch: "Ada Lovelace", features: RTX(["DLSS"], true) },
  { brand: "NVIDIA", file: NV, section: /^GeForce RTX 50 series$/, occurrence: 1, type: "desktop", arch: "Blackwell", features: RTX(["DLSS"], true) },
  { brand: "NVIDIA", file: NV, section: /^GeForce RTX 30 series$/, occurrence: 2, type: "mobile", arch: "Ampere", features: RTX(["DLSS"], false) },
  { brand: "NVIDIA", file: NV, section: /^GeForce RTX 40 series$/, occurrence: 2, type: "mobile", arch: "Ada Lovelace", features: RTX(["DLSS"], true) },
  { brand: "NVIDIA", file: NV, section: /^GeForce RTX 50 series$/, occurrence: 2, type: "mobile", arch: "Blackwell", features: RTX(["DLSS"], true), transposed: true, namePrefix: "GeForce RTX " },
  { brand: "AMD", file: AMD, section: /^Radeon RX 6000 series$/, occurrence: 1, type: "desktop", features: RTX(["FSR"], true) },
  { brand: "AMD", file: AMD, section: /^Radeon RX 7000 series$/, occurrence: 1, type: "desktop", features: RTX(["FSR"], true) },
  { brand: "AMD", file: AMD, section: /^Radeon RX 9000 series$/, occurrence: 1, type: "desktop", features: RTX(["FSR"], true) },
  { brand: "AMD", file: AMD, section: /^Radeon RX 6000M series$/, occurrence: 1, type: "mobile", features: RTX(["FSR"], true) },
  { brand: "AMD", file: AMD, section: /^Radeon RX 7000M series$/, occurrence: 1, type: "mobile", features: RTX(["FSR"], true) },
  { brand: "Intel", file: INTEL, section: /^Desktop$/, occurrence: 1, type: "desktop", arch: "Xe-HPG (Alchemist)", features: RTX(["XeSS"], false), namePrefix: "Arc " },
  { brand: "Intel", file: INTEL, section: /^Desktop$/, occurrence: 2, type: "desktop", arch: "Xe2 (Battlemage)", features: RTX(["XeSS"], true), namePrefix: "Arc " },
  { brand: "Intel", file: INTEL, section: /^Mobile$/, occurrence: 1, type: "mobile", arch: "Xe-HPG (Alchemist)", features: RTX(["XeSS"], false), namePrefix: "Arc " },
];

// Tabla traspuesta (modelos en columnas): la primera(s) columna(s) son etiquetas.
function transpose(table) {
  // "GeForce RTX | GeForce RTX (2)": encabezado repetido por colspan = dos columnas de etiquetas.
  const labelCols = table.headers[1] === table.headers[0] || table.headers[1] === `${table.headers[0]} (2)` ? 2 : 1;
  const models = table.headers.slice(labelCols);
  const headers = ["Model", ...table.rows.map((r) => (labelCols === 2 && r[0] !== r[1] ? `${r[0]} / ${r[1]}` : r[0]))];
  const rows = models.map((m, i) => [m, ...table.rows.map((r) => r[labelCols + i] ?? "")]);
  return { ...table, headers, rows };
}

function gpuName(rule, row, headers) {
  const col = (re) => headers.findIndex((h) => re.test(h));
  if (rule.brand === "Intel") {
    const model = clean(row[col(/branding and model \(2\)/i)]);
    return model ? `Arc ${model}` : null;
  }
  let name = clean(row[col(/^Model/i)]);
  if (rule.namePrefix && !name.startsWith(rule.namePrefix.trim())) name = rule.namePrefix + name;
  name = name
    .replace(/^Geforce\b/, "GeForce") // así aparece en algunas tablas de Wikipedia
    .replace(/\s*\((Navi|GA|AD|GB|TU)[^)]*\)/gi, "") // código de chip: "Radeon RX 7600 (Navi 33)"
    .replace(/\s*Mobile\s*\/\s*Laptop/i, " Laptop")
    .replace(/\s*\(Laptop\)/i, " Laptop")
    .replace(/\s+Mobile$/i, " Laptop")
    .trim();
  if (rule.type === "mobile" && rule.brand === "NVIDIA" && !/Laptop$/.test(name)) name += " Laptop";
  return name || null;
}

function rowToGpu(rule, headers, row, source) {
  const find = (test) => headers.findIndex(test);
  const cell = (test) => {
    const i = find(test);
    return i >= 0 ? row[i] : undefined;
  };
  const name = gpuName(rule, row, headers);
  if (!name || /^(—|-|n\/a)/i.test(name)) return { skip: "sin nombre" };
  // Versiones que no se venden sueltas: OEM, solo China ("D", "D V2") o integradas en consolas.
  if (/\bOEM\b|Steam Machine| D( V2)?$/i.test(name)) return { skip: "no se vende al público" };
  // La GTX 1630 es solo de escritorio; Wikipedia la repite por error en la tabla de laptops.
  if (rule.type === "mobile" && /GTX 1630/.test(name)) return { skip: "no existe en laptops" };

  const release = parseRelease(cell((h) => /^(launch|release)/i.test(h)));
  if (!release) return { skip: "sin fecha" };

  // Arquitectura: de la regla o de la columna "Architecture & fab" ("RDNA 3 TSMC N6").
  const archCell = cell((h) => /architecture/i.test(h)) ?? "";
  const arch = rule.arch ?? archCell.match(/RDNA ?\d/i)?.[0].replace(/RDNA ?/i, "RDNA ") ?? clean(archCell);

  // Memoria
  const sizeCell = cell((h) => /(memory|mem).*size/i.test(h));
  const gb = num(sizeCell);
  const memCells = headers.map((h, i) => (/memory|bus type/i.test(h) ? row[i] : "")).join(" ");
  const memType = memCells.match(/GDDR\d\w?|HBM\d?/)?.[0];
  const bits = num(cell((h) => /bus width/i.test(h))) ?? num(memCells.match(/(\d+)-bit/)?.[0]);

  // Potencia (TDP/TBP/TGP): rango en laptops.
  const powerNums = allNums(cell((h) => /^(TDP|TBP|TGP)/i.test(h)));
  const power = powerNums.length ? { min: Math.min(...powerNums), max: Math.max(...powerNums) } : undefined;
  if (power && rule.type === "desktop") power.min = power.max;

  // PCIe
  const pcieCell = cell((h) => /interface|host/i.test(h)) ?? "";
  const pcieMatch = pcieCell.match(/PCIe\s*(\d)(?:\.\d)?\s*[x×]\s*(\d+)/i);

  // FP32 (máximo de la celda; GFLOPS → TFLOPS)
  const fpIdx = find((h) => /single|fp32/i.test(h) && !/double/i.test(h));
  let tflops = fpIdx >= 0 ? Math.max(...allNums(row[fpIdx]), 0) : 0;
  if (fpIdx >= 0 && /GFLOPS/i.test(headers[fpIdx])) tflops /= 1000;
  if (tflops > 300) tflops /= 1000; // fila escrita en GFLOPS dentro de una columna de TFLOPS

  if (rule.type !== "integrated" && !gb) return { skip: "sin VRAM" };

  const gpu = {
    id: `${rule.brand.toLowerCase()}-${slug(name)}`,
    brand: rule.brand,
    name,
    aliases: aliasesFor(name),
    type: rule.type,
    release,
    architecture: arch,
    vram: { gb, ...(memType && { type: memType }), ...(bits && { bus_bits: bits }) },
  };
  if (power) gpu.power_w = power;
  if (pcieMatch) gpu.pcie = { gen: Number(pcieMatch[1]), lanes: Number(pcieMatch[2]) };
  if (tflops) gpu.fp32_tflops = Math.round(tflops * 100) / 100;
  gpu.features = rule.features;
  gpu.spec_sources = [source];
  gpu.scores = { gaming: { at_min_power: null, at_max_power: null } };
  gpu.score_meta = { method: "pending" };
  return { gpu };
}

function aliasesFor(name) {
  const a = new Set();
  const short = name.replace(/^(GeForce|Radeon) /, "");
  if (short !== name) a.add(short); // "RTX 4060 Laptop", "RX 7600"
  if (/ Laptop$/.test(name)) {
    a.add(short.replace(/ Laptop$/, " Laptop GPU"));
    a.add(short.replace(/ Laptop$/, " Mobile"));
  }
  return [...a];
}

async function run() {
  const raws = new Map();
  const byBrand = new Map();
  const stats = {};
  for (const rule of RULES) {
    if (!raws.has(rule.file)) raws.set(rule.file, JSON.parse(await readFile(join(root, "data", "raw", `${rule.file}.json`), "utf8")));
    const raw = raws.get(rule.file);
    let table = raw.tables.filter((t) => rule.section.test(t.section))[rule.occurrence - 1];
    if (!table) {
      console.warn(`  ! ${rule.brand}: no hay tabla ${rule.section} (aparición ${rule.occurrence})`);
      continue;
    }
    if (rule.transposed) table = transpose(table);

    if (!byBrand.has(rule.brand)) {
      const file = join(root, "data", "gpus", `${rule.brand.toLowerCase()}.json`);
      const existing = JSON.parse(await readFile(file, "utf8"));
      byBrand.set(rule.brand, { file, list: new Map(existing.map((g) => [g.id, g])), added: 0, kept: 0, skipped: {} });
    }
    const target = byBrand.get(rule.brand);
    for (const row of table.rows) {
      const { gpu, skip } = rowToGpu(rule, table.headers, row, raw.source);
      if (skip) {
        target.skipped[skip] = (target.skipped[skip] ?? 0) + 1;
        if (verbose) console.log(`  - omitida (${skip}) [${table.section}]: ${row.slice(0, 2).join(" | ")}`);
        continue;
      }
      const existing = target.list.get(gpu.id);
      if (existing) {
        // Solo completa campos técnicos ausentes; nunca pisa lo curado a mano.
        for (const field of ["pcie", "fp32_tflops", "spec_sources"]) {
          if (existing[field] === undefined && gpu[field] !== undefined) existing[field] = gpu[field];
        }
        target.kept++;
        continue;
      }
      target.list.set(gpu.id, gpu);
      target.added++;
    }
  }

  for (const [brand, t] of byBrand) {
    // Alias únicos dentro de la categoría: si dos fichas comparten uno, se descarta en la nueva.
    const owner = new Map();
    const list = [...t.list.values()].sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
    for (const g of list) {
      g.aliases = g.aliases.filter((a) => {
        const k = slug(a);
        if (owner.has(k) && owner.get(k) !== g.id) return false;
        owner.set(k, g.id);
        return true;
      });
    }
    if (!dry) await writeFile(t.file, formatJson(list));
    const skipped = Object.entries(t.skipped).map(([k, v]) => `${v} ${k}`).join(", ") || "ninguna";
    console.log(`${dry ? "[dry] " : ""}${brand}: ${t.added} nuevas, ${t.kept} ya existían, omitidas: ${skipped} → ${list.length} en total`);
    stats[brand] = list.length;
  }
}

await run();
