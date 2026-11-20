// Valida data/ contra los JSON Schema y aplica reglas de consistencia
// que un schema no puede expresar. Sale con código 1 si hay errores.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const dataDir = join(root, "data");
const errors = [];
const fail = (where, msg) => errors.push(`${where}: ${msg}`);

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

// --- Schemas ---------------------------------------------------------------
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
for (const name of ["common", "cpu", "gpu"]) {
  ajv.addSchema(await readJson(join(dataDir, "schema", `${name}.schema.json`)));
}
const validators = { cpus: ajv.getSchema("cpu.schema.json"), gpus: ajv.getSchema("gpu.schema.json") };

// --- Carga ------------------------------------------------------------------
async function loadCategory(category) {
  const dir = join(dataDir, category);
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const entries = [];
  for (const file of files) {
    const where = `data/${category}/${file}`;
    let list;
    try {
      list = await readJson(join(dir, file));
    } catch (e) {
      fail(where, `JSON inválido (${e.message})`);
      continue;
    }
    if (!Array.isArray(list)) {
      fail(where, "debe ser un arreglo de fichas");
      continue;
    }
    list.forEach((entry, i) => {
      const at = `${where}[${i}]${entry?.id ? ` (${entry.id})` : ""}`;
      if (!validators[category](entry)) {
        for (const err of validators[category].errors) fail(at, `${err.instancePath || "/"} ${err.message}`);
        return;
      }
      const brandPrefix = file.replace(/\.json$/, "");
      if (entry.brand.toLowerCase() !== brandPrefix) fail(at, `la marca ${entry.brand} no corresponde al archivo ${file}`);
      if (!entry.id.startsWith(`${brandPrefix}-`)) fail(at, `el id debe empezar con "${brandPrefix}-"`);
      entries.push({ entry, at });
    });
  }
  return entries;
}

const cpus = await loadCategory("cpus");
const gpus = await loadCategory("gpus");
const all = [...cpus, ...gpus];

// --- Unicidad de ids y alias -------------------------------------------------
const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const ids = new Map();
for (const { entry, at } of all) {
  if (ids.has(entry.id)) fail(at, `id duplicado (también en ${ids.get(entry.id)})`);
  ids.set(entry.id, at);
}
for (const [label, list] of [["CPU", cpus], ["GPU", gpus]]) {
  const seen = new Map();
  for (const { entry, at } of list) {
    for (const alias of new Set([entry.name, ...entry.aliases].map(normalize))) {
      if (seen.has(alias) && seen.get(alias) !== entry.id) {
        fail(at, `el nombre/alias "${alias}" ya pertenece a la ${label} ${seen.get(alias)}`);
      }
      seen.set(alias, entry.id);
    }
  }
}

// --- Reglas por categoría ----------------------------------------------------
const gpuById = new Map(gpus.map(({ entry }) => [entry.id, entry]));
const isScored = (values) => values.every((v) => v !== null);

for (const { entry, at } of cpus) {
  if (entry.platform === "desktop" && !entry.socket) fail(at, "un CPU desktop debe indicar socket");
  if (entry.platform === "mobile" && entry.socket) fail(at, "un CPU mobile no lleva socket (usar null)");
  if (entry.cores.threads < entry.cores.performance + entry.cores.efficiency) fail(at, "threads menor que el total de núcleos");
  if (entry.igpu) {
    const igpu = gpuById.get(entry.igpu);
    if (!igpu) fail(at, `igpu "${entry.igpu}" no existe en data/gpus`);
    else if (igpu.type !== "integrated") fail(at, `igpu "${entry.igpu}" no es de tipo integrated`);
  }
  checkScores(entry, at, [entry.scores.single, entry.scores.multi]);
}

for (const { entry, at } of gpus) {
  const { at_min_power: lo, at_max_power: hi } = entry.scores.gaming;
  if (entry.type !== "integrated" && !entry.vram) fail(at, "una GPU dedicada debe indicar vram");
  if (entry.type === "integrated" && entry.vram) fail(at, "una GPU integrada no lleva vram (usar null)");
  if (entry.type !== "integrated" && !entry.power_w) fail(at, "una GPU dedicada debe indicar power_w");
  if (entry.power_w && entry.power_w.min > entry.power_w.max) fail(at, "power_w.min mayor que power_w.max");
  if (entry.type === "desktop" && entry.power_w && entry.power_w.min !== entry.power_w.max) fail(at, "en desktop power_w.min debe ser igual a max");
  if (entry.type === "desktop" && lo !== hi) fail(at, "en desktop at_min_power debe ser igual a at_max_power");
  if (lo !== null && hi !== null && lo > hi) fail(at, "at_min_power mayor que at_max_power");
  checkScores(entry, at, [lo, hi]);
}

function checkScores(entry, at, values) {
  const { method } = entry.score_meta;
  if (method === "pending" && values.some((v) => v !== null)) fail(at, 'method "pending" pero tiene puntuaciones; cambia el method');
  if (method !== "pending" && !isScored(values)) fail(at, `method "${method}" requiere todas las puntuaciones`);
  if (method === "reference" && values.some((v) => v !== 100)) fail(at, "un chip de referencia debe tener 100 en todo");
  if ((method === "anchor" || method === "interpolated") && !entry.score_meta.sources?.length && !entry.score_meta.based_on?.length) {
    fail(at, `method "${method}" requiere sources o based_on`);
  }
}

for (const [label, list] of [["CPU", cpus], ["GPU", gpus]]) {
  const refs = list.filter(({ entry }) => entry.score_meta.method === "reference");
  if (refs.length !== 1) fail(label, `debe haber exactamente 1 chip de referencia, hay ${refs.length}`);
}

// --- Perfiles de puntuación ------------------------------------------------
const profiles = await readJson(join(root, "scoring", "profiles.json"));
const metrics = new Set(Object.keys(profiles.curves));
const ruleMetrics = new Set([...metrics, "vram_gb", "gpu_type", "isa", "platform"]);
for (const [name, curve] of Object.entries(profiles.curves)) {
  for (let i = 1; i < curve.length; i++) {
    if (curve[i][0] <= curve[i - 1][0]) fail(`curves.${name}`, "los puntos deben estar en orden creciente");
    if (curve[i][1] < curve[i - 1][1]) fail(`curves.${name}`, "la nota no puede bajar al subir el valor");
  }
}
for (const [name, profile] of Object.entries(profiles.profiles)) {
  const sum = Object.values(profile.weights).reduce((a, b) => a + b, 0);
  if (Math.abs(sum - 1) > 1e-9) fail(`profiles.${name}`, `los pesos suman ${sum}, deben sumar 1`);
  for (const metric of Object.keys(profile.weights)) {
    if (!metrics.has(metric)) fail(`profiles.${name}`, `peso sobre métrica sin curva: ${metric}`);
  }
  for (const rule of profile.rules) {
    if (!ruleMetrics.has(rule.metric)) fail(`profiles.${name}`, `regla sobre métrica desconocida: ${rule.metric}`);
    if (!["<", "<=", ">", ">=", "==", "!="].includes(rule.op)) fail(`profiles.${name}`, `operador inválido: ${rule.op}`);
  }
}

// --- Resumen ---------------------------------------------------------------
const pending = all.filter(({ entry }) => entry.score_meta.method === "pending").length;
if (errors.length) {
  console.error(`✖ ${errors.length} error(es):\n` + errors.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log(`✔ Datos válidos: ${cpus.length} CPUs, ${gpus.length} GPUs (${pending} sin puntuar), ${Object.keys(profiles.profiles).length} perfiles.`);
