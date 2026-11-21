import { test } from "node:test";
import assert from "node:assert/strict";
import type { CPU, GPU } from "./data-types.ts";
import { computeTops, relative } from "./scale.ts";

const cpu = (id: string, single: number | null, multi: number | null, name = id): CPU => ({
  id, brand: "AMD", name, aliases: [], platform: "desktop", isa: "x86", release: "2025", architecture: "Zen 5",
  cores: { performance: 8, efficiency: 0, threads: 16 }, scores: { single, multi }, score_meta: { method: "estimated" },
});
const gpu = (id: string, index: number | null, type: GPU["type"] = "desktop"): GPU => ({
  id, brand: "NVIDIA", name: id, aliases: [], type, release: "2025", architecture: "Blackwell",
  scores: { gaming: { at_min_power: index, at_max_power: index } }, score_meta: { method: "estimated" },
});

test("el mejor de cada métrica vale 100 y el resto es proporcional", () => {
  const tops = computeTops([cpu("a", 100, 100), cpu("b", 120, 300), cpu("c", null, null)], [gpu("x", 100), gpu("y", 400)]);
  assert.equal(tops.cpuSingle.id, "b");
  assert.equal(relative(120, tops.cpuSingle), 100);
  assert.equal(relative(100, tops.cpuSingle), 83);
  assert.equal(relative(100, tops.gpuGaming), 25);
  assert.equal(relative(null, tops.gpuGaming), null);
});

test("cuando entra un chip mejor, pasa a ser el 100 y los anteriores bajan", () => {
  const before = computeTops([cpu("a", 100, 100)], [gpu("tope-actual", 400)]);
  const after = computeTops([cpu("a", 100, 100)], [gpu("tope-actual", 400), gpu("nueva-generacion", 420)]);
  assert.equal(relative(400, before.gpuGaming), 100);
  assert.equal(relative(400, after.gpuGaming), 95);
});

test("en juegos, una X3D de un chiplet supera a una de dos chiplets con algo más de single-core", () => {
  const single = { ...cpu("9850x3d", 119, 165, "Ryzen 7 9850X3D"), cores: { performance: 8, efficiency: 0, threads: 16 } };
  const dual = { ...cpu("9950x3d", 121, 337, "Ryzen 9 9950X3D"), cores: { performance: 16, efficiency: 0, threads: 32 } };
  assert.equal(computeTops([single, dual], [gpu("x", 100)]).cpuGaming.id, "9850x3d");
});

test("las GPU de laptop no pueden ser el tope; las X3D ganan en juegos", () => {
  const tops = computeTops(
    [cpu("rapida", 121, 337, "Ryzen 9 9950X"), cpu("x3d", 119, 165, "Ryzen 7 9850X3D")],
    [gpu("escritorio", 100), gpu("laptop-enorme", 500, "mobile")],
  );
  assert.equal(tops.gpuGaming.id, "escritorio");
  assert.equal(tops.cpuGaming.id, "x3d");
  assert.equal(tops.cpuSingle.id, "rapida");
});
