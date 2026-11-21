import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CPU, GPU } from "./data-types.ts";
import type { ProfilesConfig } from "./scoring.ts";
import { buildWarnings, defaultBuild, pairGpu, ramSpeedFactor, rankGpus, type BuildMock } from "./pairing.ts";

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
const build = (over: Partial<BuildMock> = {}): BuildMock => ({ ramGb: 16, ramMts: 3200, resolution: "1080p", psuW: 750, boardPcieGen: 4, ...over });

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
  assert.deepEqual(defaultBuild(cpu()), { ramGb: 16, ramMts: 3200, resolution: "1080p", psuW: 650, boardPcieGen: 4 });
  assert.equal(defaultBuild(cpu({ socket: "AM5" })).ramGb, 32);
  assert.equal(defaultBuild(cpu({ socket: "AM5" })).ramMts, 6000);
  assert.ok(buildWarnings(build({ ramGb: 8 }), config).length > 0);
  assert.equal(buildWarnings(build({ ramGb: 32 }), config).length, 0);
});

test("RAM más rápida sube el techo de la CPU en juegos; más lenta lo baja", () => {
  const top = gpu("tope", 330); // limitada por la CPU: el techo manda
  const slow = pairGpu(cpu(), top, build({ ramMts: 2666 }), config)!;
  const base = pairGpu(cpu(), top, build({ ramMts: 3200 }), config)!;
  const fast = pairGpu(cpu(), top, build({ ramMts: 3600 }), config)!;
  assert.ok(slow.effective < base.effective && base.effective < fast.effective);
  const gain = fast.effective / base.effective - 1;
  assert.ok(gain > 0.02 && gain < 0.06, `DDR4-3600 vs 3200: ${(gain * 100).toFixed(1)} %`);
});

test("las CPUs X3D dependen menos de la velocidad de la RAM y el efecto está acotado", () => {
  const x3d = cpu({ name: "Ryzen 7 5800X3D" });
  assert.ok(ramSpeedFactor(x3d, 2400) > ramSpeedFactor(cpu(), 2400));
  assert.ok(ramSpeedFactor(cpu(), 1000) >= 0.85);
  assert.ok(ramSpeedFactor(cpu({ socket: "AM5" }), 9000) <= 1.08);
  assert.equal(ramSpeedFactor(cpu({ socket: "AM5" }), 6000), 1);
});
