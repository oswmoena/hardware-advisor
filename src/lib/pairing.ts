// Emparejamiento CPU ↔ GPU para un PC de escritorio: qué tarjetas gráficas aprovechan mejor
// un procesador, con un equipo de ejemplo editable. Lógica pura, sin E/S.
import type { CPU, GPU } from "./data-types.ts";
import { compare, gpuGamingIndex, scoreSystem, type ProfileResult, type ProfilesConfig } from "./scoring.ts";

export type Resolution = "1080p" | "1440p" | "4k";
export interface BuildMock {
  ramGb: number;
  /** Velocidad de la RAM en MT/s (p. ej. 3200 para DDR4-3200). */
  ramMts: number;
  resolution: Resolution;
  psuW: number;
  /** Generación PCIe de la ranura de la GPU en la placa madre. */
  boardPcieGen: number;
}
export type Balance = "balanced" | "cpu-limited" | "gpu-limited";

export interface Pairing {
  gpu: GPU;
  /** Rendimiento del conjunto en juegos (unidades de índice GPU a 1080p). */
  effective: number;
  /** >1: la CPU limita a la GPU; <1: la GPU es el límite. */
  ratio: number;
  balance: Balance;
  gaming: ProfileResult;
  warnings: string[];
  recommendedPsuW: number;
}

/** Cuánto pesa cada resolución sobre la GPU (más píxeles = la GPU rinde "menos"). */
export const RESOLUTION_LOAD: Record<Resolution, number> = { "1080p": 1, "1440p": 1.45, "4k": 2.4 };
export const RESOLUTION_LABEL: Record<Resolution, string> = { "1080p": "1080p (Full HD)", "1440p": "1440p (2K)", "4k": "4K" };
/** Una CPU de índice 100 alimenta sin cuello de botella una GPU de ~170 a 1080p. */
const CPU_FEEDS_GPU = 1.7;
const BALANCED_MAX = 1.15;
const BALANCED_MIN = 0.55;

/** Bono para juegos de las CPUs con caché 3D. */
export const X3D_GAMING_BONUS = 0.2;
/** En las X3D de dos chiplets (más de 8 núcleos) solo uno lleva la caché 3D: en juegos rinden algo menos. */
export const X3D_DUAL_CCD_GAMING_BONUS = 0.17;
export const isX3D = (cpu: CPU) => /X3D/.test(cpu.name);
/** Bono para juegos de una CPU X3D (0 si no lo es). */
export const x3dBonus = (cpu: CPU) =>
  !isX3D(cpu) ? 0 : cpu.cores.performance + cpu.cores.efficiency > 8 ? X3D_DUAL_CCD_GAMING_BONUS : X3D_GAMING_BONUS;

/** Capacidad de la CPU para juegos: sobre todo single-core; la caché 3D (X3D) ayuda mucho. */
export function cpuGamingIndex(cpu: CPU): number | null {
  const { single, multi } = cpu.scores;
  if (single === null || multi === null) return null;
  return (0.8 * single + 0.2 * Math.min(multi, 150)) * (1 + x3dBonus(cpu));
}

// --- Velocidad de la RAM ------------------------------------------------------
/** Velocidad de referencia (factor 1) por tipo de memoria. */
export const RAM_BASELINE_MTS = { DDR4: 3200, DDR5: 6000 } as const;
export const RAM_SPEED_OPTIONS = { DDR4: [2400, 2666, 3000, 3200, 3600, 4000], DDR5: [4800, 5200, 5600, 6000, 6400, 7200] } as const;
/** Sensibilidad del rendimiento en juegos limitados por CPU a la velocidad de la RAM (logarítmica). */
const RAM_SENSITIVITY = 0.35;
const RAM_SENSITIVITY_X3D = 0.15; // la caché 3D amortigua la dependencia de la RAM

/** Multiplicador sobre la capacidad de la CPU en juegos según la velocidad de la RAM. */
export function ramSpeedFactor(cpu: CPU, mts: number): number {
  const baseline = RAM_BASELINE_MTS[ramTypeFor(cpu)];
  const k = isX3D(cpu) ? RAM_SENSITIVITY_X3D : RAM_SENSITIVITY;
  return Math.min(Math.max(1 + k * Math.log(mts / baseline), 0.85), 1.08);
}

/** Generación PCIe máxima que ofrece la CPU para la GPU. */
export function cpuPcieGen(cpu: CPU): number {
  switch (cpu.socket) {
    case "AM4": return /Cezanne/.test(cpu.architecture) ? 3 : 4;
    case "LGA1200": return 4;
    case "AM5":
    case "LGA1700":
    case "LGA1851": return 5;
    default: return 4;
  }
}

/** Equipo típico de hoy según la plataforma del procesador. */
export function defaultBuild(cpu: CPU): BuildMock {
  const modern = cpu.socket === "AM5" || cpu.socket === "LGA1700" || cpu.socket === "LGA1851";
  return {
    ramGb: modern ? 32 : 16,
    ramMts: RAM_BASELINE_MTS[ramTypeFor(cpu)],
    resolution: modern ? "1440p" : "1080p",
    psuW: modern ? 750 : 650,
    boardPcieGen: Math.min(cpuPcieGen(cpu), 4), // la mayoría de placas de gama media: ranura PCIe 4.0
  };
}

export const ramTypeFor = (cpu: CPU): "DDR4" | "DDR5" => (cpu.socket === "AM4" || cpu.socket === "LGA1200" ? "DDR4" : "DDR5");

/** Pérdida por usar una GPU de pocas líneas PCIe en una ranura de generación anterior. */
function pcieFactor(gpu: GPU, slotGen: number): number {
  if (!gpu.pcie || gpu.pcie.lanes >= 16 || slotGen >= gpu.pcie.gen) return 1;
  const gap = gpu.pcie.gen - slotGen;
  if (gpu.pcie.lanes <= 4) return gap >= 2 ? 0.75 : 0.88;
  return gap >= 2 ? 0.92 : 0.97;
}

const round50 = (n: number) => Math.ceil(n / 50) * 50;
const VRAM_MIN: Record<Resolution, number> = { "1080p": 8, "1440p": 10, "4k": 12 };

export function pairGpu(cpu: CPU, gpu: GPU, build: BuildMock, config: ProfilesConfig): Pairing | null {
  const cpuGaming = cpuGamingIndex(cpu);
  const gpuIndex = gpu.scores.gaming.at_max_power;
  if (cpuGaming === null || gpuIndex === null) return null;

  const slotGen = Math.min(build.boardPcieGen, cpuPcieGen(cpu));
  const pcie = pcieFactor(gpu, slotGen);
  const load = RESOLUTION_LOAD[build.resolution];
  const gpuAtRes = (gpuIndex * pcie) / load;
  const cpuCap = cpuGaming * ramSpeedFactor(cpu, build.ramMts) * CPU_FEEDS_GPU;
  const effective = Math.min(gpuAtRes, cpuCap);
  const ratio = gpuAtRes / cpuCap;
  const balance: Balance = ratio > BALANCED_MAX ? "cpu-limited" : ratio < BALANCED_MIN ? "gpu-limited" : "balanced";

  // Nota de juegos del equipo completo a esa resolución, con el rendimiento ya limitado por la CPU.
  const effectiveGpu: GPU = { ...gpu, scores: { ...gpu.scores, gaming: { at_min_power: effective, at_max_power: effective } } };
  const gaming = scoreSystem({ cpu, gpu: effectiveGpu, ramGb: build.ramGb }, config).find((r) => r.key === "gaming")!;

  const warnings: string[] = [];
  const cpuW = cpu.power_w?.max ?? (cpu.power_w?.base ?? 65) * 1.35;
  const gpuW = gpu.power_w?.max ?? 150;
  const need = cpuW + gpuW + 75; // placa, RAM, SSD, ventiladores
  const recommendedPsuW = round50(need * 1.3);
  if (build.psuW < need * 1.1) warnings.push(`Fuente insuficiente: este equipo puede consumir ~${Math.round(need)} W; usa una de ${recommendedPsuW} W o más.`);
  else if (build.psuW < recommendedPsuW) warnings.push(`Fuente justa: se recomiendan ${recommendedPsuW} W para tener margen.`);
  if (gpu.vram && gpu.vram.gb < VRAM_MIN[build.resolution]) warnings.push(`${gpu.vram.gb} GB de VRAM se quedan cortos en ${build.resolution} con juegos nuevos.`);
  if (pcie < 1) warnings.push(`Usa PCIe ${gpu.pcie!.gen}.0 x${gpu.pcie!.lanes}: en una ranura PCIe ${slotGen}.0 pierde ~${Math.round((1 - pcie) * 100)} % de rendimiento.`);

  return { gpu, effective, ratio, balance, gaming, warnings, recommendedPsuW };
}

export interface Ranking {
  /** Equilibradas o modestas, de mayor a menor rendimiento real (a igualdad, la menos sobrada primero). */
  recommended: Pairing[];
  /** Más potentes de lo que la CPU aprovecha, de la menos a la más sobredimensionada. */
  overkill: Pairing[];
}

/** GPUs de escritorio ordenadas de mejor a peor emparejamiento para esta CPU. */
export function rankGpus(cpu: CPU, gpus: GPU[], build: BuildMock, config: ProfilesConfig): Ranking {
  const all = gpus
    .filter((g) => g.type === "desktop")
    .map((g) => pairGpu(cpu, g, build, config))
    .filter((p): p is Pairing => p !== null);
  const round = (n: number) => Math.round(n * 10) / 10;
  return {
    recommended: all
      .filter((p) => p.balance !== "cpu-limited")
      .sort((a, b) => round(b.effective) - round(a.effective) || a.ratio - b.ratio),
    overkill: all.filter((p) => p.balance === "cpu-limited").sort((a, b) => a.ratio - b.ratio),
  };
}

// --- Laptops ------------------------------------------------------------------
/** En juegos, la CPU de una laptop comparte presupuesto térmico y de potencia con la GPU. */
const LAPTOP_CPU_SUSTAINED = 0.8;
/** Las GPUs de laptop son mucho más modestas: solo es "la GPU es el límite" si queda muy por debajo. */
const LAPTOP_BALANCED_MIN = 0.4;
export interface LaptopSetup {
  ramGb: number;
  resolution: Resolution;
  /** TGP de la GPU en esta laptop; undefined si no se conoce. */
  gpuPowerW?: number;
}
export interface LaptopCombo {
  /** Índice de la GPU a esa potencia (o punto medio si no se conoce). */
  gpuIndex: number;
  /** Rango posible del índice cuando el TGP es desconocido. */
  gpuRange?: [number, number];
  effective: number;
  ratio: number;
  balance: Balance;
  gaming: ProfileResult;
  warnings: string[];
}

/**
 * Qué tal es la combinación CPU + GPU de una laptop para jugar. `cpu` ya debe venir ajustada por
 * la memoria de la laptop (adjustCpuForMemory). En laptops no hay fuente ni ranura que elegir:
 * lo que manda es el TGP con que el fabricante configuró la GPU.
 */
export function laptopCombo(cpu: CPU, gpu: GPU, setup: LaptopSetup, config: ProfilesConfig): LaptopCombo | null {
  const cpuGaming = cpuGamingIndex(cpu);
  const index = gpuGamingIndex(gpu, setup.gpuPowerW);
  if (cpuGaming === null || index.value === null) return null;

  const load = RESOLUTION_LOAD[setup.resolution];
  const gpuAtRes = index.value / load;
  const cpuCap = cpuGaming * CPU_FEEDS_GPU * LAPTOP_CPU_SUSTAINED;
  const effective = Math.min(gpuAtRes, cpuCap);
  const ratio = gpuAtRes / cpuCap;
  const balance: Balance = ratio > BALANCED_MAX ? "cpu-limited" : ratio < LAPTOP_BALANCED_MIN ? "gpu-limited" : "balanced";

  const effectiveGpu: GPU = { ...gpu, scores: { ...gpu.scores, gaming: { at_min_power: effective, at_max_power: effective } } };
  const gaming = scoreSystem({ cpu, gpu: effectiveGpu, ramGb: setup.ramGb }, config).find((r) => r.key === "gaming")!;

  const warnings = gaming.warnings.filter((w) => !w.includes("VRAM")); // la de VRAM se evalúa por resolución abajo
  if (index.powerUnknown && index.range) {
    warnings.push(
      "Sin el TGP usamos un valor intermedio: según cómo la configure cada laptop, esta GPU puede rendir bastante más o bastante menos.",
    );
  }
  if (gpu.vram && gpu.vram.gb < VRAM_MIN[setup.resolution]) {
    warnings.push(`${gpu.vram.gb} GB de VRAM se quedan cortos en ${setup.resolution} con juegos nuevos.`);
  }
  if (gpu.power_w && setup.gpuPowerW !== undefined && setup.gpuPowerW > gpu.power_w.max) {
    warnings.push(
      `${setup.gpuPowerW} W supera el TGP oficial (${gpu.power_w.max} W): probablemente incluye Dynamic Boost, que suma poco rendimiento; lo evaluamos como ${gpu.power_w.max} W.`,
    );
  }
  return { gpuIndex: index.value, gpuRange: index.powerUnknown ? index.range : undefined, effective, ratio, balance, gaming: { ...gaming, warnings }, warnings };
}

/** GPUs de laptop más comunes en el mercado, candidatas a sugerencia. */
const COMMON_LAPTOP_GPUS = ["3050", "3050-ti", "3060", "4050", "4060", "4070", "5050", "5060", "5070"].map(
  (n) => `nvidia-geforce-rtx-${n}-laptop`,
);
/** Equilibrio buscado para la sugerencia (con TGP desconocido, a 1080p): las HX suelen ir con GPUs de gama alta. */
const SUGGESTION_TARGET_RATIO = 0.5;
const SUGGESTION_TARGET_RATIO_HX = 0.8;
const HX_MIN_WATTS = 55;
/** Por debajo de este consumo base (U, N, Lunar Lake) casi nunca hay GPU dedicada. */
const MIN_CPU_WATTS_FOR_DGPU = 20;

/**
 * GPU de laptop común que mejor se equilibra con esta CPU, para preseleccionarla como ejemplo.
 * null si la CPU es de bajo consumo (rara vez trae GPU dedicada) o no hay candidatas puntuadas.
 */
export function suggestLaptopGpu(cpu: CPU, gpus: GPU[], config: ProfilesConfig): GPU | null {
  const watts = cpu.power_w?.base ?? 45;
  if (watts < MIN_CPU_WATTS_FOR_DGPU) return null;
  const target = watts >= HX_MIN_WATTS ? SUGGESTION_TARGET_RATIO_HX : SUGGESTION_TARGET_RATIO;
  const candidates = gpus
    .filter((g) => COMMON_LAPTOP_GPUS.includes(g.id))
    .map((gpu) => ({ gpu, combo: laptopCombo(cpu, gpu, { ramGb: 16, resolution: "1080p" }, config) }))
    .filter((c) => c.combo !== null)
    .map(({ gpu, combo }) => ({ gpu, distance: Math.abs(combo!.ratio - target) }));
  if (!candidates.length) return null;
  const minDistance = Math.min(...candidates.map((c) => c.distance));
  // Entre las que quedan a ±0,05 del mejor equilibrio, la más nueva.
  return candidates
    .filter((c) => c.distance <= minDistance + 0.05)
    .sort((a, b) => b.gpu.release.localeCompare(a.gpu.release) || a.distance - b.distance)[0].gpu;
}

/** Advertencias del equipo que no dependen de la GPU (p. ej. poca RAM). */
export function buildWarnings(build: BuildMock, config: ProfilesConfig): string[] {
  return config.profiles.gaming.rules
    .filter((r) => r.metric === "ram_gb" && r.warning && compare(build.ramGb, r.op, r.value))
    .map((r) => r.warning!);
}
