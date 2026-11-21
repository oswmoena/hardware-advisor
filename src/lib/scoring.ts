// Motor de puntuación: convierte índices (referencia = 100) y la RAM en una nota
// de 0 a 10 por uso, según scoring/profiles.json. Lógica pura, sin E/S.
import type { CPU, GPU } from "./data-types.ts";

export type Metric = "cpu_single" | "cpu_multi" | "gpu_gaming" | "ram_gb";
export type Fact = Metric | "vram_gb" | "gpu_type" | "isa" | "platform";
type Op = "<" | "<=" | ">" | ">=" | "==" | "!=";

export interface Rule {
  metric: Fact;
  op: Op;
  value: number | string;
  max_score?: number;
  warning?: string;
}
export interface Profile {
  label: string;
  weights: Partial<Record<Metric, number>>;
  rules: Rule[];
}
export interface ProfilesConfig {
  curves: Record<Metric, [number, number][]>;
  verdicts: { min: number; label: string }[];
  profiles: Record<string, Profile>;
}

export interface SystemSpec {
  cpu: CPU;
  /** GPU que usará el equipo: la dedicada o, si no hay, la integrada. null si se desconoce. */
  gpu: GPU | null;
  ramGb: number;
  /** TGP real de la GPU de laptop, si se conoce. */
  gpuPowerW?: number;
}

export interface ProfileResult {
  key: string;
  label: string;
  /** null si falta alguna puntuación necesaria (ver `missing`). */
  score: number | null;
  verdict: string | null;
  warnings: string[];
  missing: string[];
}

const METRIC_LABELS: Record<Metric, string> = {
  cpu_single: "rendimiento single-core de la CPU",
  cpu_multi: "rendimiento multi-core de la CPU",
  gpu_gaming: "rendimiento en juegos de la GPU",
  ram_gb: "cantidad de RAM",
};

/** Interpolación lineal entre puntos [valor, nota], acotada a los extremos. */
export function evalCurve(points: [number, number][], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) {
      const [x0, y0] = points[i - 1];
      return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return points[points.length - 1][1];
}

export interface GpuGaming {
  value: number | null;
  /** Rango posible cuando la potencia (TGP) es desconocida en una GPU de laptop. */
  range?: [number, number];
  powerUnknown: boolean;
}

/**
 * Índice gaming de una GPU para una potencia dada (o el punto medio si no se conoce).
 * Una potencia sobre el máximo oficial (TGP anunciado con Dynamic Boost) se evalúa como el máximo.
 */
export function gpuGamingIndex(gpu: GPU, powerW?: number): GpuGaming {
  const { at_min_power: lo, at_max_power: hi } = gpu.scores.gaming;
  if (lo === null || hi === null) return { value: null, powerUnknown: false };
  if (lo === hi || !gpu.power_w || gpu.power_w.min === gpu.power_w.max) return { value: hi, powerUnknown: false };
  const { min, max } = gpu.power_w;
  if (powerW === undefined) return { value: (lo + hi) / 2, range: [lo, hi], powerUnknown: true };
  const t = Math.min(Math.max((powerW - min) / (max - min), 0), 1);
  return { value: lo + t * (hi - lo), powerUnknown: false };
}

export function compare(a: number | string, op: Op, b: number | string): boolean {
  switch (op) {
    case "<": return a < b;
    case "<=": return a <= b;
    case ">": return a > b;
    case ">=": return a >= b;
    case "==": return a === b;
    case "!=": return a !== b;
  }
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function verdictFor(score: number, config: ProfilesConfig): string {
  return config.verdicts.find((v) => score >= v.min)?.label ?? config.verdicts[config.verdicts.length - 1].label;
}

export function scoreSystem(spec: SystemSpec, config: ProfilesConfig): ProfileResult[] {
  const gaming = spec.gpu ? gpuGamingIndex(spec.gpu, spec.gpuPowerW) : null;
  const metrics: Record<Metric, number | null> = {
    cpu_single: spec.cpu.scores.single,
    cpu_multi: spec.cpu.scores.multi,
    gpu_gaming: gaming?.value ?? null,
    ram_gb: spec.ramGb,
  };
  const facts: Record<Fact, number | string | null> = {
    ...metrics,
    vram_gb: spec.gpu?.vram?.gb ?? null,
    gpu_type: spec.gpu?.type ?? null,
    isa: spec.cpu.isa,
    platform: spec.cpu.platform,
  };

  return Object.entries(config.profiles).map(([key, profile]) => {
    const warnings: string[] = [];
    const missing: string[] = [];
    let total = 0;
    for (const [metric, weight] of Object.entries(profile.weights) as [Metric, number][]) {
      const value = metrics[metric];
      if (value === null) {
        missing.push(METRIC_LABELS[metric]);
        continue;
      }
      total += weight * evalCurve(config.curves[metric], value);
    }

    let cap = 10;
    for (const rule of profile.rules) {
      const fact = facts[rule.metric];
      if (fact === null || !compare(fact, rule.op, rule.value)) continue; // dato desconocido: la regla no aplica
      if (rule.max_score !== undefined) cap = Math.min(cap, rule.max_score);
      if (rule.warning) warnings.push(rule.warning);
    }
    if (gaming?.powerUnknown && "gpu_gaming" in profile.weights) {
      warnings.push("El rendimiento de esta GPU de laptop depende mucho de su TGP; sin ese dato se usa un valor intermedio.");
    }

    if (missing.length) return { key, label: profile.label, score: null, verdict: null, warnings, missing };
    const score = round1(Math.min(total, cap));
    return { key, label: profile.label, score, verdict: verdictFor(score, config), warnings, missing };
  });
}
