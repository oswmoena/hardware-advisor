// Estimación automática (provisional) de índices de rendimiento desde especificaciones.
// Calibrada a mano contra resultados públicos conocidos; se reemplaza chip a chip con anclas.
// Referencias: CPU AMD Ryzen 5 7600 = 100; GPU NVIDIA GeForce RTX 4060 = 100.

// --- CPU ---------------------------------------------------------------------
// IPC relativo a Zen 4 (orden importa: lo más específico primero).
const CPU_IPC = [
  [/Zen 5/, 1.08],
  [/Zen 4/, 1.0],
  [/Zen 3\+/, 0.92],
  [/Zen 3/, 0.9],
  [/Zen 2/, 0.8],
  [/Zen\+/, 0.7],
  [/Arrow Lake|Lunar Lake/, 1.07],
  [/Raptor Lake/, 1.02],
  [/Alder Lake-N|Twin Lake|Gracemont/, 0.7],
  [/Alder Lake/, 1.0],
  [/Meteor Lake/, 0.98],
  [/Rocket Lake|Tiger Lake/, 0.88],
  [/Ice Lake/, 0.86],
  [/Coffee Lake|Comet Lake/, 0.72], // núcleo Skylake
];
// Núcleos de eficiencia / compactos: IPC y frecuencia relativa al núcleo P.
const E_CORES = [
  [/Zen/, { ipc: null, clock: 0.72 }], // Zen 4c/5c: mismo IPC, menos frecuencia
  [/Arrow Lake|Lunar Lake/, { ipc: 0.95, clock: 0.8 }], // Skymont
  [/Meteor Lake/, { ipc: 0.72, clock: 0.75 }], // Crestmont
  [/.*/, { ipc: 0.7, clock: 0.75 }], // Gracemont (Alder/Raptor)
];

const pick = (table, text, fallback) => table.find(([re]) => re.test(text))?.[1] ?? fallback;

/** Fracción de la frecuencia turbo que se sostiene con todos los núcleos cargados. */
function allCoreFactor(cpu) {
  const w = cpu.power_w?.base;
  if (cpu.platform === "desktop") return w && w > 65 ? 0.92 : 0.88;
  return Math.min(Math.max(0.5 + 0.007 * (w ?? 35), 0.55), 0.85);
}

function cpuRaw(cpu) {
  const ipc = pick(CPU_IPC, cpu.architecture, null);
  const boost = cpu.clocks_ghz?.boost ?? (cpu.clocks_ghz?.base ? cpu.clocks_ghz.base * 1.25 : null);
  if (ipc === null || !boost) return null;
  const { performance: p, efficiency: e, threads } = cpu.cores;
  const isAmd = cpu.brand === "AMD";
  const smtP = threads > p + e; // Intel: HT solo en núcleos P; AMD: SMT en todos
  const eCore = pick(E_CORES, cpu.architecture, { ipc: 0.7, clock: 0.75 });
  const eIpc = eCore.ipc ?? ipc;
  const f = allCoreFactor(cpu);

  const single = boost * ipc * (cpu.platform === "mobile" ? 0.95 : 1);
  const pThroughput = p * boost * f * ipc * (smtP ? 1.25 : 1);
  const eThroughput = e * boost * eCore.clock * f * eIpc * (isAmd && smtP ? 1.25 : 1);
  return { single, multi: pThroughput + eThroughput };
}

/** Índices estimados de una CPU respecto de la referencia, o null si faltan datos. */
export function estimateCpu(cpu, referenceCpu) {
  const raw = cpuRaw(cpu);
  const ref = cpuRaw(referenceCpu);
  if (!raw || !ref) return null;
  return { single: Math.round((100 * raw.single) / ref.single), multi: Math.round((100 * raw.multi) / ref.multi) };
}

// --- GPU ---------------------------------------------------------------------
// Rendimiento en juegos por TFLOP relativo a Ada (corrige p. ej. el "dual-issue" de RDNA 3).
const GPU_ARCH = [
  [/Blackwell/, 1.0],
  [/Ada/, 1.0],
  [/Ampere/, 0.93],
  [/RDNA 4/, 0.83],
  [/RDNA 3/, 0.75],
  [/RDNA 2/, 1.41],
  [/Battlemage/, 1.21],
  [/Alchemist/, 0.82],
  [/Turing/, 1.45], // sus TFLOPS no están inflados por dual-issue como en Ampere
  [/RDNA 1/, 1.4],
];
/** Turing con GDDR5 (GTX 1650/1660 originales) queda limitada por el ancho de banda. */
const GDDR5_TURING_FACTOR = 0.8;
const EXPONENT = 0.7; // el rendimiento no escala linealmente con los TFLOPS
const MOBILE_FACTOR = 0.9; // térmica y memoria de laptop frente a la misma GPU en escritorio
const POWER_EXPONENT = 0.55; // rendimiento ~ potencia^0.55 dentro del rango de TGP

const gpuRaw = (gpu) => {
  const k = pick(GPU_ARCH, gpu.architecture, null);
  if (k === null || !gpu.fp32_tflops) return null;
  const memory = /Turing/.test(gpu.architecture) && gpu.vram?.type === "GDDR5" ? GDDR5_TURING_FACTOR : 1;
  return gpu.fp32_tflops * k * memory;
};

/** Índice gaming estimado (a potencia mínima y máxima), o null si faltan datos. */
export function estimateGpu(gpu, referenceGpu) {
  const raw = gpuRaw(gpu);
  const ref = gpuRaw(referenceGpu);
  if (!raw || !ref) return null;
  let max = 100 * (raw / ref) ** EXPONENT;
  if (gpu.type === "mobile") max *= MOBILE_FACTOR;
  let min = max;
  if (gpu.power_w && gpu.power_w.min < gpu.power_w.max) min = max * (gpu.power_w.min / gpu.power_w.max) ** POWER_EXPONENT;
  return { at_min_power: Math.round(min), at_max_power: Math.round(max) };
}
