import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CPU, GPU } from "./data-types.ts";
import type { ProfilesConfig } from "./scoring.ts";
import { buildWarnings, defaultBuild, pairGpu, rankGpus, type BuildMock } from "./pairing.ts";

const config: ProfilesConfig = JSON.parse(readFileSync(new URL("../../scoring/profiles.json", import.meta.url), "utf8"));

const cpu = (over: Partial<CPU> = {}): CPU => ({
  id: "amd-cpu", brand: "AMD", name: "Ryzen 7 5700X", aliases: [], platform: "desktop", isa: "x86", release: "2022",
  architecture: "Zen 3 (Vermeer)", cores: { performance: 8, efficiency: 0, threads: 16 }, socket: "AM4",
  power_w: { base: 65 }, scores: { single: 80, multi: 105 }, score_meta: { method: "estimated" }, ...over,
});
const gpu = (id: string, index: number, over: Partial<GPU> = {}): GPU => ({
  id, brand: "NVIDIA", name: id, aliases: [], type: "desktop", release: "2024", architecture: "Ada",
  vram: { gb: 12 }, power_w: { min: 200, max: 200 }, pcie: { gen: 4, lanes: 16 },
  scores: { gaming: { at_min_power: index, at_max_power: index } }, score_meta: { method: "estimated" }, ...over,
});
const build = (over: Partial<BuildMock> = {}): BuildMock => ({ ramGb: 16, resolution: "1080p", psuW: 750, boardPcieGen: 4, ...over });

test("las GPUs que la CPU no aprovecha van aparte; las recomendadas se ordenan por rendimiento real", () => {
  const { recommended, overkill } = rankGpus(cpu(), [gpu("tope", 330), gpu("baja", 50), gpu("justa", 140), gpu("media", 100)], build(), config);
  assert.deepEqual(recommended.map((p) => p.gpu.id), ["justa", "media", "baja"]);
  assert.deepEqual(overkill.map((p) => p.gpu.id), ["tope"]);
  assert.equal(recommended.at(-1)!.balance, "gpu-limited");
});

test("a igual rendimiento real (techo de la CPU), va primero la GPU menos sobredimensionada", () => {
  // CPU de prueba: techo ≈ 144 (0,8·80 + 0,2·105 = 85 × 1,7). Ambas lo superan sin llegar a "limitada".
  const { recommended } = rankGpus(cpu(), [gpu("mas", 160), gpu("menos", 150)], build(), config);
  assert.equal(recommended[0].gpu.id, "menos");
});

test("a mayor resolución la misma CPU aprovecha una GPU más potente", () => {
  const top = gpu("tope", 330);
  const at1080 = pairGpu(cpu(), top, build({ resolution: "1080p" }), config)!;
  const at4k = pairGpu(cpu(), top, build({ resolution: "4k" }), config)!;
  assert.ok(at4k.ratio < at1080.ratio);
  assert.equal(at4k.balance, "balanced");
});

test("advierte fuente insuficiente, poca VRAM y PCIe x8 en ranura 3.0", () => {
  const card = gpu("x8", 100, { vram: { gb: 6 }, power_w: { min: 300, max: 300 }, pcie: { gen: 4, lanes: 8 } });
  const p = pairGpu(cpu(), card, build({ psuW: 450, boardPcieGen: 3 }), config)!;
  assert.ok(p.warnings.some((w) => w.startsWith("Fuente insuficiente")));
  assert.ok(p.warnings.some((w) => w.includes("VRAM")));
  assert.ok(p.warnings.some((w) => w.includes("PCIe")));
});

test("ignora GPUs de laptop o sin puntuación", () => {
  const { recommended, overkill } = rankGpus(cpu(), [gpu("laptop", 90, { type: "mobile" }), gpu("pendiente", 0, { scores: { gaming: { at_min_power: null, at_max_power: null } } })], build(), config);
  assert.equal(recommended.length + overkill.length, 0);
});

test("equipo por defecto según plataforma y advertencia de RAM", () => {
  assert.deepEqual(defaultBuild(cpu()), { ramGb: 16, resolution: "1080p", psuW: 650, boardPcieGen: 4 });
  assert.equal(defaultBuild(cpu({ socket: "AM5" })).ramGb, 32);
  assert.ok(buildWarnings(build({ ramGb: 8 }), config).length > 0);
  assert.equal(buildWarnings(build({ ramGb: 32 }), config).length, 0);
});
