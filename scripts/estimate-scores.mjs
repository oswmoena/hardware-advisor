// Completa con índices estimados (method "estimated") las fichas sin puntuar.
// Recalcula las que ya eran "estimated" (para aplicar cambios de fórmula) y nunca toca
// las de referencia, ancla o interpoladas.
//
// Uso:  npm run estimate [-- --dry]
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { estimateCpu, estimateGpu } from "./lib/estimate.mjs";
import { formatJson } from "./lib/json-format.mjs";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const dry = process.argv.includes("--dry");
const EDITABLE = new Set(["pending", "estimated"]);

async function loadDir(dir) {
  const files = (await readdir(join(root, "data", dir))).filter((f) => f.endsWith(".json"));
  return Promise.all(files.map(async (f) => ({ path: join(root, "data", dir, f), list: JSON.parse(await readFile(join(root, "data", dir, f), "utf8")) })));
}

const cpuFiles = await loadDir("cpus");
const gpuFiles = await loadDir("gpus");
const refCpu = cpuFiles.flatMap((f) => f.list).find((c) => c.score_meta.method === "reference");
const refGpu = gpuFiles.flatMap((f) => f.list).find((g) => g.score_meta.method === "reference");

function apply(files, estimate, setScores, label) {
  let estimated = 0, missing = 0, curated = 0;
  for (const file of files) {
    for (const chip of file.list) {
      if (!EDITABLE.has(chip.score_meta.method)) { curated++; continue; }
      const result = estimate(chip);
      if (!result) {
        missing++;
        if (chip.score_meta.method === "estimated") { setScores(chip, null); chip.score_meta = { method: "pending" }; }
        continue;
      }
      setScores(chip, result);
      chip.score_meta = { method: "estimated" };
      estimated++;
    }
  }
  console.log(`${dry ? "[dry] " : ""}${label}: ${estimated} estimadas, ${missing} sin datos suficientes, ${curated} curadas (sin cambios)`);
}

apply(cpuFiles, (c) => estimateCpu(c, refCpu), (c, r) => { c.scores = r ?? { single: null, multi: null }; }, "CPUs");
apply(gpuFiles, (g) => estimateGpu(g, refGpu), (g, r) => { g.scores = { ...g.scores, gaming: r ?? { at_min_power: null, at_max_power: null } }; }, "GPUs");

if (!dry) {
  for (const f of [...cpuFiles, ...gpuFiles]) await writeFile(f.path, formatJson(f.list));
}
