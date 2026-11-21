// Textos y cálculos de presentación compartidos por las páginas.
import type { CPU, GPU } from "./data-types.ts";
import { scoreSystem, type ProfileResult, type ProfilesConfig } from "./scoring.ts";
import type { SearchItem } from "./search.ts";

export const SITE_NAME = "Hardware Advisor";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const ASSUMED_RAM_GB = 16;

export const cpuTag = (cpu: CPU) => (cpu.platform === "mobile" ? "Laptop" : "Escritorio");
export const gpuTag = (gpu: GPU) => ({ desktop: "Escritorio", mobile: "Laptop", integrated: "Integrada" })[gpu.type];

export const toSearchItem = (chip: CPU | GPU, kind: "cpu" | "gpu"): SearchItem => ({
  id: chip.id,
  kind,
  name: chip.name,
  aliases: chip.aliases,
  tag: kind === "cpu" ? cpuTag(chip as CPU) : gpuTag(chip as GPU),
  release: chip.release,
});

const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export function formatRelease(release: string): string {
  const [year, month] = release.split("-");
  return month ? `${MONTHS[Number(month) - 1]} de ${year}` : year;
}

/** Notas de una CPU sola: programación y ofimática con 16 GB; juegos depende de la GPU. */
export function scoreCpuAlone(cpu: CPU, igpu: GPU | null, config: ProfilesConfig): ProfileResult[] {
  return scoreSystem({ cpu, gpu: igpu, ramGb: ASSUMED_RAM_GB }, config).filter((r) => r.key !== "gaming");
}

/** Nota de juegos de una GPU, emparejada con la CPU de referencia y 16 GB. */
export function scoreGpuAlone(gpu: GPU, referenceCpu: CPU, config: ProfilesConfig): ProfileResult | undefined {
  return scoreSystem({ cpu: referenceCpu, gpu, ramGb: ASSUMED_RAM_GB }, config).find((r) => r.key === "gaming");
}

/** "Recomendable para: …" a partir de las notas (Bueno o mejor). */
export function recommendedFor(results: ProfileResult[]): string[] {
  return results.filter((r) => r.score !== null && r.score >= 6.5).map((r) => r.label.toLowerCase());
}

/** Puntos en la escala visible (100 = el mejor actual). */
export const formatPoints = (points: number | null) => (points === null ? "Pendiente" : `${points} / 100`);
