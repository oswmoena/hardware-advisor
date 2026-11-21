// Carga de datos desde data/ y scoring/ (solo en el servidor / en build).
// Las rutas se escriben literalmente por carpeta para que el bundler sepa qué archivos se leen.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { CPU, GPU } from "./data-types.ts";
import { computeTops, type ScaleTops } from "./scale.ts";
import type { ProfilesConfig } from "./scoring.ts";

const parse = <T,>(path: string): T => JSON.parse(readFileSync(path, "utf8"));
const jsonFiles = (dir: string) => readdirSync(dir).filter((f) => f.endsWith(".json"));
const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id, "en", { numeric: true });

function loadCpus(): CPU[] {
  const dir = join(process.cwd(), "data", "cpus");
  return jsonFiles(dir).flatMap((f) => parse<CPU[]>(join(process.cwd(), "data", "cpus", f))).sort(byId);
}
function loadGpus(): GPU[] {
  const dir = join(process.cwd(), "data", "gpus");
  return jsonFiles(dir).flatMap((f) => parse<GPU[]>(join(process.cwd(), "data", "gpus", f))).sort(byId);
}

let cache: { cpus: CPU[]; gpus: GPU[]; profiles: ProfilesConfig } | null = null;
function load() {
  cache ??= {
    cpus: loadCpus(),
    gpus: loadGpus(),
    profiles: parse<ProfilesConfig>(join(process.cwd(), "scoring", "profiles.json")),
  };
  return cache;
}

export const getCpus = () => load().cpus;
export const getGpus = () => load().gpus;
export const getProfiles = () => load().profiles;
export const getCpu = (id: string) => getCpus().find((c) => c.id === id);
export const getGpu = (id: string) => getGpus().find((g) => g.id === id);
let tops: ScaleTops | null = null;
/** Mejores chips actuales de cada métrica: definen el 100 de la escala visible. */
export const getTops = () => (tops ??= computeTops(getCpus(), getGpus()));
export const getReferenceCpu = () => getCpus().find((c) => c.score_meta.method === "reference")!;
export const getReferenceGpu = () => getGpus().find((g) => g.score_meta.method === "reference")!;
