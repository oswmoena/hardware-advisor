import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateCpu, estimateGpu } from "./estimate.mjs";

const refCpu = {
  brand: "AMD", platform: "desktop", architecture: "Zen 4 (Raphael)",
  cores: { performance: 6, efficiency: 0, threads: 12 }, clocks_ghz: { boost: 5.1 }, power_w: { base: 65 },
};
const refGpu = { type: "desktop", architecture: "Ada Lovelace", fp32_tflops: 15.11, power_w: { min: 115, max: 115 } };

test("la CPU de referencia da 100 / 100", () => {
  assert.deepEqual(estimateCpu(refCpu, refCpu), { single: 100, multi: 100 });
});

test("más núcleos suben el multi-core pero no el single-core", () => {
  const bigger = { ...refCpu, cores: { performance: 12, efficiency: 0, threads: 24 } };
  const r = estimateCpu(bigger, refCpu);
  assert.equal(r.single, 100);
  assert.ok(r.multi > 180 && r.multi < 220, String(r.multi));
});

test("una CPU de laptop de bajo consumo rinde menos en multi-core que su par de alto consumo", () => {
  const u = { ...refCpu, platform: "mobile", power_w: { base: 15 } };
  const h = { ...refCpu, platform: "mobile", power_w: { base: 45 } };
  assert.ok(estimateCpu(u, refCpu).multi < estimateCpu(h, refCpu).multi);
});

test("arquitectura desconocida o sin frecuencia: no se inventa un número", () => {
  assert.equal(estimateCpu({ ...refCpu, architecture: "Desconocida" }, refCpu), null);
  assert.equal(estimateCpu({ ...refCpu, clocks_ghz: {} }, refCpu), null);
  assert.equal(estimateGpu({ ...refGpu, fp32_tflops: undefined }, refGpu), null);
});

test("la GPU de referencia da 100 y el escalado es sublineal", () => {
  assert.deepEqual(estimateGpu(refGpu, refGpu), { at_min_power: 100, at_max_power: 100 });
  const double = estimateGpu({ ...refGpu, fp32_tflops: 30.22 }, refGpu);
  assert.ok(double.at_max_power > 150 && double.at_max_power < 200, String(double.at_max_power));
});

test("GPU de laptop: menor potencia mínima → menor índice a potencia mínima", () => {
  const laptop = { ...refGpu, type: "mobile", power_w: { min: 35, max: 115 } };
  const r = estimateGpu(laptop, refGpu);
  assert.ok(r.at_min_power < r.at_max_power);
  assert.ok(r.at_max_power < 100, "una GPU de laptop rinde menos que la misma en escritorio");
});
