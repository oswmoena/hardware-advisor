// Emparejamiento CPU ↔ GPU para un PC de escritorio: qué tarjetas gráficas aprovechan mejor
// un procesador, con un equipo de ejemplo editable. Lógica pura, sin E/S.
import type { CPU, GPU } from "./data-types.ts";
import { compare, scoreSystem, type ProfileResult, type ProfilesConfig } from "./scoring.ts";

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
export const isX3D = (cpu: CPU) => /X3D/.test(cpu.name);

/** Capacidad de la CPU para juegos: sobre todo single-core; la caché 3D (X3D) ayuda mucho. */
export function cpuGamingIndex(cpu: CPU): number | null {
  const { single, multi } = cpu.scores;
  if (single === null || multi === null) return null;
  return (0.8 * single + 0.2 * Math.min(multi, 150)) * (isX3D(cpu) ? 1 + X3D_GAMING_BONUS : 1);
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

/** Advertencias del equipo que no dependen de la GPU (p. ej. poca RAM). */
export function buildWarnings(build: BuildMock, config: ProfilesConfig): string[] {
  return config.profiles.gaming.rules
    .filter((r) => r.metric === "ram_gb" && r.warning && compare(build.ramGb, r.op, r.value))
    .map((r) => r.warning!);
}
