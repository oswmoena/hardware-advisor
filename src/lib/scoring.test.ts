import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CPU, GPU } from "./data-types.ts";
import { evalCurve, gpuGamingIndex, scoreSystem, type ProfilesConfig } from "./scoring.ts";

const config: ProfilesConfig = JSON.parse(readFileSync(new URL("../../scoring/profiles.json", import.meta.url), "utf8"));

const cpu = (over: Partial<CPU> = {}): CPU => ({
  id: "amd-test", brand: "AMD", name: "Test", aliases: [], platform: "desktop", isa: "x86",
  release: "2023", architecture: "Zen 4", cores: { performance: 6, efficiency: 0, threads: 12 },
  scores: { single: 100, multi: 100 }, score_meta: { method: "anchor", sources: ["https://example.com"] },
  ...over,
});
const gpu = (over: Partial<GPU> = {}): GPU => ({
  id: "nvidia-test", brand: "NVIDIA", name: "Test GPU", aliases: [], type: "desktop", release: "2023",
  architecture: "Ada", vram: { gb: 8 }, power_w: { min: 115, max: 115 },
  scores: { gaming: { at_min_power: 100, at_max_power: 100 } }, score_meta: { method: "anchor", sources: ["https://example.com"] },
  ...over,
});
const byKey = (results: ReturnType<typeof scoreSystem>) => Object.fromEntries(results.map((r) => [r.key, r]));

test("evalCurve interpola y acota en los extremos", () => {
  const curve: [number, number][] = [[0, 0], [100, 10]];
  assert.equal(evalCurve(curve, -5), 0);
  assert.equal(evalCurve(curve, 50), 5);
  assert.equal(evalCurve(curve, 500), 10);
});

test("las referencias (100) con 16 GB dan notas altas y sin advertencias", () => {
  const r = byKey(scoreSystem({ cpu: cpu(), gpu: gpu(), ramGb: 16 }, config));
  for (const key of ["gaming", "programming", "office"]) {
    assert.ok(r[key].score! >= 7, `${key}: ${r[key].score}`);
    assert.deepEqual(r[key].warnings, []);
  }
});

test("8 GB de RAM limita la nota de juegos y programación y advierte", () => {
  const r = byKey(scoreSystem({ cpu: cpu({ scores: { single: 200, multi: 200 } }), gpu: gpu(), ramGb: 8 }, config));
  assert.ok(r.gaming.score! <= 6);
  assert.ok(r.programming.score! <= 6);
  assert.ok(r.gaming.warnings.some((w) => w.includes("16 GB")));
});

test("multitarea: pesa la RAM y los núcleos; con 8 GB queda limitada y advierte", () => {
  const few = byKey(scoreSystem({ cpu: cpu({ scores: { single: 100, multi: 60 } }), gpu: null, ramGb: 32 }, config));
  const many = byKey(scoreSystem({ cpu: cpu({ scores: { single: 100, multi: 200 } }), gpu: null, ramGb: 32 }, config));
  const low = byKey(scoreSystem({ cpu: cpu({ scores: { single: 100, multi: 200 } }), gpu: null, ramGb: 8 }, config));
  assert.ok(many.multitasking.score! > few.multitasking.score!);
  assert.ok(low.multitasking.score! <= 5.5);
  assert.ok(low.multitasking.warnings.some((w) => w.includes("16 GB")));
});

test("con 4 GB de RAM todas las notas quedan bajas y con advertencia, aunque el resto sea bueno", () => {
  const r = byKey(scoreSystem({ cpu: cpu({ scores: { single: 150, multi: 300 } }), gpu: gpu(), ramGb: 4 }, config));
  assert.ok(r.gaming.score! <= 4 && r.programming.score! <= 4, `${r.gaming.score} / ${r.programming.score}`);
  assert.ok(r.multitasking.score! <= 3.5 && r.office.score! <= 3.5, `${r.multitasking.score} / ${r.office.score}`);
  for (const key of ["gaming", "programming", "multitasking", "office"]) {
    assert.ok(r[key].warnings.some((w) => /menos de 8 GB|4 GB/i.test(w)), key);
  }
  // Solo la advertencia de la regla más estricta, no también la de "< 16 GB".
  assert.ok(!r.gaming.warnings.some((w) => w.includes("16 GB de RAM es el mínimo")));
  assert.equal(r.programming.warnings.filter((w) => /GB/.test(w)).length, 1);
});

test("una puntuación faltante devuelve null y explica qué falta", () => {
  const r = byKey(scoreSystem({ cpu: cpu({ scores: { single: null, multi: null } }), gpu: gpu(), ramGb: 16 }, config));
  assert.equal(r.office.score, null);
  assert.equal(r.office.verdict, null);
  assert.ok(r.office.missing.length > 0);
});

test("GPU de laptop: interpola por TGP y avisa si no se conoce", () => {
  const laptop = gpu({ type: "mobile", power_w: { min: 35, max: 115 }, scores: { gaming: { at_min_power: 50, at_max_power: 90 } } });
  assert.equal(gpuGamingIndex(laptop, 35).value, 50);
  assert.equal(gpuGamingIndex(laptop, 75).value, 70);
  assert.equal(gpuGamingIndex(laptop, 200).value, 90);
  const unknown = gpuGamingIndex(laptop);
  assert.equal(unknown.value, 70);
  assert.deepEqual(unknown.range, [50, 90]);
  const r = byKey(scoreSystem({ cpu: cpu(), gpu: laptop, ramGb: 16 }, config));
  assert.ok(r.gaming.warnings.some((w) => w.includes("TGP")));
  assert.ok(!r.office.warnings.some((w) => w.includes("TGP")));
});

test("ARM e integrada generan advertencias de juegos", () => {
  const igpu = gpu({ type: "integrated", vram: null, power_w: undefined, scores: { gaming: { at_min_power: 20, at_max_power: 20 } } });
  const r = byKey(scoreSystem({ cpu: cpu({ isa: "arm" }), gpu: igpu, ramGb: 16 }, config));
  assert.ok(r.gaming.warnings.some((w) => w.includes("integrada")));
  assert.ok(r.gaming.warnings.some((w) => w.includes("ARM")));
  assert.ok(!r.gaming.warnings.some((w) => w.includes("VRAM")), "la regla de VRAM no aplica a integradas");
});
