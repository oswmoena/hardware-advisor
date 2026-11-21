import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CPU, GPU } from "./data-types.ts";
import type { ProfilesConfig } from "./scoring.ts";
import { buildWarnings, defaultBuild, laptopCombo, pairGpu, ramSpeedFactor, rankGpus, suggestLaptopGpu, type BuildMock } from "./pairing.ts";

test("sugerencia de GPU de laptop: la común más equilibrada; ninguna en CPUs de bajo consumo", () => {
  const common = (n: string, max: number) =>
    gpu(`nvidia-geforce-rtx-${n}-laptop`, 0, { type: "mobile", release: "2023", power_w: { min: 35, max: 115 }, scores: { gaming: { at_min_power: max * 0.5, at_max_power: max } } });
  const list = [common("4050", 77), common("4060", 87), common("4070", 110), gpu("rara-laptop", 0, { type: "mobile", scores: { gaming: { at_min_power: 60, at_max_power: 90 } } })];
  const hCpu = cpu({ platform: "mobile", socket: null, power_w: { base: 45 }, scores: { single: 95, multi: 115 } });
  const uCpu = cpu({ platform: "mobile", socket: null, power_w: { base: 15 }, scores: { single: 82, multi: 53 } });
  const suggested = suggestLaptopGpu(hCpu, list, config);
  assert.ok(suggested && suggested.id !== "rara-laptop", "solo GPUs comunes");
  assert.equal(suggestLaptopGpu(uCpu, list, config), null);
});

const laptopCpu = (): CPU => cpu({ platform: "mobile", socket: null, scores: { single: 95, multi: 115 } });
const laptopGpu = (over: Partial<GPU> = {}): GPU =>
  gpu("rtx-laptop", 0, { type: "mobile", vram: { gb: 8 }, power_w: { min: 35, max: 115 }, scores: { gaming: { at_min_power: 45, at_max_power: 87 } }, ...over });

test("laptop: más TGP da mejor nota de juegos; sin TGP se usa el punto medio y se avisa", () => {
  const low = laptopCombo(laptopCpu(), laptopGpu(), { ramGb: 16, resolution: "1080p", gpuPowerW: 35 }, config)!;
  const high = laptopCombo(laptopCpu(), laptopGpu(), { ramGb: 16, resolution: "1080p", gpuPowerW: 115 }, config)!;
  const unknown = laptopCombo(laptopCpu(), laptopGpu(), { ramGb: 16, resolution: "1080p" }, config)!;
  assert.ok(low.gaming.score! < high.gaming.score!);
  assert.equal(low.gpuIndex, 45);
  assert.equal(unknown.gpuIndex, 66);
  assert.deepEqual(unknown.gpuRange, [45, 87]);
  assert.ok(unknown.warnings.some((w) => w.includes("TGP")));
  assert.ok(!high.warnings.some((w) => w.includes("TGP")));
});

test("laptop: GPU muy potente para la CPU queda limitada; GPU débil queda como límite", () => {
  const strong = laptopGpu({ scores: { gaming: { at_min_power: 300, at_max_power: 300 } }, power_w: { min: 150, max: 150 } });
  const weak = laptopGpu({ scores: { gaming: { at_min_power: 40, at_max_power: 40 } }, power_w: { min: 50, max: 50 } });
  assert.equal(laptopCombo(laptopCpu(), strong, { ramGb: 16, resolution: "1080p" }, config)!.balance, "cpu-limited");
  assert.equal(laptopCombo(laptopCpu(), weak, { ramGb: 16, resolution: "1080p" }, config)!.balance, "gpu-limited");
});

test("laptop: una CPU H con una GPU de gama media a TGP alto se considera equilibrada", () => {
  const combo = laptopCombo(laptopCpu(), laptopGpu(), { ramGb: 16, resolution: "1080p", gpuPowerW: 115 }, config)!;
  assert.equal(combo.balance, "balanced");
});

test("laptop: TGP sobre el oficial (Dynamic Boost) se evalúa como el máximo y se avisa", () => {
  const g = laptopGpu({ power_w: { min: 35, max: 80 }, scores: { gaming: { at_min_power: 32, at_max_power: 51 } } });
  const atMax = laptopCombo(laptopCpu(), g, { ramGb: 16, resolution: "1080p", gpuPowerW: 80 }, config)!;
  const boosted = laptopCombo(laptopCpu(), g, { ramGb: 16, resolution: "1080p", gpuPowerW: 96 }, config)!;
  assert.equal(boosted.gpuIndex, atMax.gpuIndex);
  assert.equal(boosted.gaming.score, atMax.gaming.score);
  assert.ok(boosted.warnings.some((w) => w.includes("Dynamic Boost")));
  assert.ok(!atMax.warnings.some((w) => w.includes("Dynamic Boost")));
});

test("laptop: TGP escrito a mano entre pasos se usa tal cual; bajo el mínimo se evalúa como el mínimo y se avisa", () => {
  const g = laptopGpu({ power_w: { min: 35, max: 115 }, scores: { gaming: { at_min_power: 45, at_max_power: 87 } } });
  const at96 = laptopCombo(laptopCpu(), g, { ramGb: 16, resolution: "1080p", gpuPowerW: 96 }, config)!;
  assert.ok(at96.gpuIndex > 77 && at96.gpuIndex < 78, `96 W interpola entre 35 y 115 W: ${at96.gpuIndex}`);
  const below = laptopCombo(laptopCpu(), g, { ramGb: 16, resolution: "1080p", gpuPowerW: 20 }, config)!;
  const atMin = laptopCombo(laptopCpu(), g, { ramGb: 16, resolution: "1080p", gpuPowerW: 35 }, config)!;
  assert.equal(below.gpuIndex, atMin.gpuIndex);
  assert.ok(below.warnings.some((w) => w.includes("mínimo oficial")));
  assert.ok(!atMin.warnings.some((w) => w.includes("mínimo oficial")));
});

test("laptop: advierte VRAM corta según la resolución y poca RAM", () => {
  const combo = laptopCombo(laptopCpu(), laptopGpu({ vram: { gb: 8 } }), { ramGb: 8, resolution: "1440p", gpuPowerW: 100 }, config)!;
  assert.ok(combo.warnings.some((w) => w.includes("VRAM")));
  assert.ok(combo.warnings.some((w) => w.includes("16 GB")));
});

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
