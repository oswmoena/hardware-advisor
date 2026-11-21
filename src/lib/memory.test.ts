import { test } from "node:test";
import assert from "node:assert/strict";
import type { CPU } from "./data-types.ts";
import { adjustCpuForMemory, adjustCpuForMemorySpeed, defaultRamGb, laptopMemory, memoryLabel } from "./memory.ts";

test("escritorio: la velocidad de la RAM se compara contra la base de su tipo (DDR4-3200 / DDR5-6000)", () => {
  const c = cpu("Zen 3 (Vermeer)");
  assert.deepEqual(adjustCpuForMemorySpeed(c, 3200, 3200).scores, { single: 100, multi: 100 });
  assert.ok(adjustCpuForMemorySpeed(c, 2666, 3200).scores.multi! < 100);
  assert.ok(adjustCpuForMemorySpeed(c, 3600, 3200).scores.multi! > 100);
});

const cpu = (architecture: string): CPU => ({
  id: "x", brand: "Intel", name: "Test", aliases: [], platform: "mobile", isa: "x86", release: "2023", architecture,
  cores: { performance: 6, efficiency: 4, threads: 16 }, scores: { single: 100, multi: 100 }, score_meta: { method: "estimated" },
});

test("opciones de memoria según la generación del procesador", () => {
  assert.equal(memoryLabel(laptopMemory(cpu("Raptor Lake")).default), "DDR5-5200");
  assert.ok(laptopMemory(cpu("Tiger Lake")).options.every((o) => o.type === "DDR4" || o.type === "LPDDR4X"));
  assert.equal(memoryLabel(laptopMemory(cpu("Zen 3+ (Rembrandt-R)")).default), "DDR5-4800", "Zen 3+ no cae en la regla de Zen 3");
  assert.equal(memoryLabel(laptopMemory(cpu("Zen 3 (Cezanne and Barceló)")).default), "DDR4-3200");
});

test("Lunar Lake y Strix Halo tienen la memoria soldada en el encapsulado", () => {
  assert.equal(laptopMemory(cpu("Lunar Lake")).soldered, true);
  assert.equal(laptopMemory(cpu("Zen 5 (Strix Halo)")).soldered, true);
  assert.equal(laptopMemory(cpu("Meteor Lake")).soldered, false);
  assert.deepEqual(laptopMemory(cpu("Lunar Lake")).capacities, [16, 32]);
  assert.equal(defaultRamGb(laptopMemory(cpu("Zen 5 (Strix Halo)"))), 32, "Strix Halo no existe con 16 GB");
  assert.equal(defaultRamGb(laptopMemory(cpu("Raptor Lake"))), 16);
});

test("la memoria por defecto no altera los índices; más rápida los sube, más lenta los baja", () => {
  const c = cpu("Raptor Lake");
  assert.deepEqual(adjustCpuForMemory(c, laptopMemory(c).default).scores, { single: 100, multi: 100 });
  const slow = adjustCpuForMemory(c, { type: "DDR4", mts: 3200 }).scores;
  const fast = adjustCpuForMemory(c, { type: "LPDDR5", mts: 6400 }).scores;
  assert.ok(slow.multi! < 100 && fast.multi! > 100);
  assert.ok(100 - slow.single! < 100 - slow.multi!, "el multi-core es más sensible que el single-core");
  assert.ok(slow.multi! >= 90 && fast.multi! <= 106, "efecto acotado");
});
