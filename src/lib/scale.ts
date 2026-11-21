// Escala visible "100 = el mejor actual". Los índices guardados en data/ son relativos a una
// referencia interna de calibración (Ryzen 5 7600 / RTX 4060 = 100); aquí se convierten a
// porcentaje del mejor chip de la base. Cuando entra uno mejor, pasa a ser el 100 y el resto baja.
import type { CPU, GPU } from "./data-types.ts";
import { cpuGamingIndex } from "./pairing.ts";

export interface Top {
  id: string;
  name: string;
  value: number;
}
export interface ScaleTops {
  cpuSingle: Top;
  cpuMulti: Top;
  /** Capacidad para juegos (single-core, algo de multi-core y bono X3D). */
  cpuGaming: Top;
  /** GPU de escritorio más potente: las de laptop se miden contra ella. */
  gpuGaming: Top;
}

function topBy<T extends { id: string; name: string }>(items: T[], value: (item: T) => number | null): Top {
  let best: Top | null = null;
  for (const item of items) {
    const v = value(item);
    if (v !== null && (!best || v > best.value)) best = { id: item.id, name: item.name, value: v };
  }
  if (!best) throw new Error("No hay chips puntuados para calcular la escala");
  return best;
}

export function computeTops(cpus: CPU[], gpus: GPU[]): ScaleTops {
  return {
    cpuSingle: topBy(cpus, (c) => c.scores.single),
    cpuMulti: topBy(cpus, (c) => c.scores.multi),
    cpuGaming: topBy(cpus, cpuGamingIndex),
    gpuGaming: topBy(gpus.filter((g) => g.type === "desktop"), (g) => g.scores.gaming.at_max_power),
  };
}

/** Índice interno → puntos sobre 100 respecto del mejor actual (mínimo 1 si hay valor). */
export function relative(value: number | null, top: Top): number | null {
  if (value === null) return null;
  return Math.max(1, Math.round((100 * value) / top.value));
}
