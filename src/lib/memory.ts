// Memoria de laptops: opciones típicas por generación de procesador y su efecto en los índices.
// Lógica pura, sin E/S.
import type { CPU } from "./data-types.ts";

export interface MemoryOption {
  type: "DDR4" | "DDR5" | "LPDDR4X" | "LPDDR5" | "LPDDR5X";
  mts: number;
}
export interface LaptopMemory {
  options: MemoryOption[];
  /** Opción más común para este procesador (y base del cálculo: factor 1). */
  default: MemoryOption;
  /** Memoria integrada en el encapsulado: no se puede ampliar ni cambiar. */
  soldered: boolean;
  /** Cantidades en que existe (memoria integrada) o habituales en laptops. */
  capacities: number[];
}

/** Cantidades de RAM habituales en laptops. */
export const LAPTOP_RAM_GB = [4, 6, 8, 12, 16, 24, 32, 48, 64];
const SOLDERED_CAPACITIES: [RegExp, number[]][] = [
  [/Lunar Lake/, [16, 32]],
  [/Strix Halo|Gorgon Halo/, [32, 64, 128]],
];

export const memoryLabel = (m: MemoryOption) => `${m.type}-${m.mts}`;
const opt = (label: string): MemoryOption => {
  const [type, mts] = label.split("-");
  return { type: type as MemoryOption["type"], mts: Number(mts) };
};

// Orden: lo más específico primero. [patrón de arquitectura, opciones, por defecto, soldada]
const GENERATIONS: [RegExp, string[], string, boolean][] = [
  [/Lunar Lake/, ["LPDDR5X-8533"], "LPDDR5X-8533", true],
  [/Strix Halo|Gorgon Halo/, ["LPDDR5X-8000"], "LPDDR5X-8000", true],
  [/Mendocino/, ["LPDDR5-5500"], "LPDDR5-5500", false],
  [/Tiger Lake/, ["DDR4-2666", "DDR4-3200", "LPDDR4X-4267"], "DDR4-3200", false],
  [/Alder Lake-N|Twin Lake/, ["DDR4-3200", "DDR5-4800", "LPDDR5-4800"], "LPDDR5-4800", false],
  [/Alder Lake/, ["DDR4-3200", "DDR5-4800", "LPDDR5-5200"], "DDR5-4800", false],
  [/Raptor Lake/, ["DDR4-3200", "DDR5-4800", "DDR5-5200", "LPDDR5-5200", "LPDDR5-6400"], "DDR5-5200", false],
  [/Meteor Lake/, ["DDR5-5600", "LPDDR5X-6400", "LPDDR5X-7467"], "DDR5-5600", false],
  [/Arrow Lake/, ["DDR5-5600", "DDR5-6400", "LPDDR5X-7467", "LPDDR5X-8400"], "DDR5-5600", false],
  [/Dragon Range|Fire Range/, ["DDR5-4800", "DDR5-5200", "DDR5-5600"], "DDR5-5200", false],
  [/Strix Point|Krackan|Gorgon Point/, ["DDR5-5600", "LPDDR5X-7500", "LPDDR5X-8000"], "DDR5-5600", false],
  [/Phoenix|Hawk Point/, ["DDR5-4800", "DDR5-5600", "LPDDR5X-7500"], "DDR5-5600", false],
  [/Zen 3\+|Rembrandt/, ["DDR5-4800", "LPDDR5-6400"], "DDR5-4800", false],
  [/Zen 2|Zen 3/, ["DDR4-2666", "DDR4-3200", "LPDDR4X-4266"], "DDR4-3200", false],
];
const FALLBACK: LaptopMemory = {
  options: ["DDR4-3200", "DDR5-4800", "DDR5-5600"].map(opt), default: opt("DDR5-4800"), soldered: false, capacities: LAPTOP_RAM_GB,
};

export function laptopMemory(cpu: CPU): LaptopMemory {
  const gen = GENERATIONS.find(([re]) => re.test(cpu.architecture));
  if (!gen) return FALLBACK;
  const [, options, def, soldered] = gen;
  const capacities = SOLDERED_CAPACITIES.find(([re]) => re.test(cpu.architecture))?.[1] ?? LAPTOP_RAM_GB;
  return { options: options.map(opt), default: opt(def), soldered, capacities };
}

/** Cantidad de RAM por defecto: 16 GB si existe esa configuración; si no, la más chica. */
export const defaultRamGb = (memory: LaptopMemory) => (memory.capacities.includes(16) ? 16 : memory.capacities[0]);

// Fuera de juegos, la velocidad de la RAM pesa poco en single-core y algo más en multi-core.
const SINGLE_SENSITIVITY = 0.06;
const MULTI_SENSITIVITY = 0.12;
const clamp = (n: number) => Math.min(Math.max(n, 0.9), 1.06);

/** Índices de la CPU de laptop ajustados por la memoria, respecto de la opción típica. */
export function adjustCpuForMemory(cpu: CPU, memory: MemoryOption): CPU {
  return adjustCpuForMemorySpeed(cpu, memory.mts, laptopMemory(cpu).default.mts);
}

/** Índices de la CPU ajustados por la velocidad de la RAM respecto de una velocidad base. */
export function adjustCpuForMemorySpeed(cpu: CPU, mts: number, baselineMts: number): CPU {
  const rel = Math.log(mts / baselineMts);
  const { single, multi } = cpu.scores;
  return {
    ...cpu,
    scores: {
      single: single === null ? null : single * clamp(1 + SINGLE_SENSITIVITY * rel),
      multi: multi === null ? null : multi * clamp(1 + MULTI_SENSITIVITY * rel),
    },
  };
}
