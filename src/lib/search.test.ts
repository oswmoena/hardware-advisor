import { test } from "node:test";
import assert from "node:assert/strict";
import { searchChips, type SearchItem } from "./search.ts";

const items: SearchItem[] = [
  { id: "intel-core-i7-13620h", kind: "cpu", name: "Core i7-13620H", aliases: ["i7-13620H", "i7 13620H"], tag: "Laptop", release: "2023-01" },
  { id: "intel-core-i7-1360p", kind: "cpu", name: "Core i7-1360P", aliases: ["i7-1360P"], tag: "Laptop", release: "2023" },
  { id: "nvidia-geforce-rtx-4060", kind: "gpu", name: "GeForce RTX 4060", aliases: ["RTX 4060"], tag: "Escritorio", release: "2023-06" },
  { id: "nvidia-geforce-rtx-4060-laptop", kind: "gpu", name: "GeForce RTX 4060 Laptop", aliases: ["RTX 4060 Laptop"], tag: "Laptop", release: "2023-02" },
];

test("encuentra por modelo con o sin guiones ni espacios", () => {
  for (const q of ["13620h", "i7 13620H", "i7-13620h", "Core i7 13620H"]) {
    assert.equal(searchChips(items, q)[0]?.id, "intel-core-i7-13620h", q);
  }
});

test("todas las palabras deben coincidir y la coincidencia exacta va primero", () => {
  assert.deepEqual(searchChips(items, "rtx 4060 laptop").map((i) => i.id), ["nvidia-geforce-rtx-4060-laptop"]);
  assert.equal(searchChips(items, "rtx 4060")[0].id, "nvidia-geforce-rtx-4060");
});

test("consulta vacía o sin resultados devuelve lista vacía", () => {
  assert.deepEqual(searchChips(items, "   "), []);
  assert.deepEqual(searchChips(items, "m3 max"), []);
});
