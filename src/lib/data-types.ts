// Generado por scripts/gen-types.mjs desde data/schema. No editar a mano.

/**
 * URLs de donde salen los datos (idealmente enlaces a una revisión fija).
 */
export type Sources = string[];

/**
 * Ficha de un procesador. Índices de rendimiento relativos a la referencia AMD Ryzen 5 7600 = 100.
 */
export interface CPU {
  id: string;
  brand: "Intel" | "AMD" | "Apple" | "Qualcomm";
  name: string;
  aliases: string[];
  platform: "desktop" | "mobile";
  isa: "x86" | "arm";
  release: string;
  architecture: string;
  cores: {
    performance: number;
    efficiency: number;
    threads: number;
  };
  clocks_ghz?: {
    base?: number;
    boost?: number;
  };
  /**
   * Desktop: base = TDP, max = PPT/PL2. Mobile: rango configurable por el fabricante del equipo.
   */
  power_w?: {
    base?: number;
    max?: number;
  };
  memory?: {
    types?: string[];
    max_gb?: number;
  };
  /**
   * Solo desktop (AM5, LGA1700, LGA1851...). null en mobile.
   */
  socket?: string | null;
  /**
   * id de la GPU integrada en data/gpus, o null si no tiene.
   */
  igpu?: string | null;
  npu_tops?: number | null;
  spec_sources?: Sources;
  scores: CpuScores;
  score_meta: ScoreMeta;
  notes?: string[];
}
export interface CpuScores {
  /**
   * Índice relativo a la referencia (= 100). null mientras no se haya estimado.
   */
  single: number | null;
  /**
   * Índice relativo a la referencia (= 100). null mientras no se haya estimado.
   */
  multi: number | null;
}
export interface ScoreMeta {
  /**
   * reference: chip de referencia (100 por definición). anchor: estimado a mano desde reviews. interpolated: derivado de anclas de la misma familia. estimated: estimación automática desde especificaciones (provisional). pending: aún sin puntuar.
   */
  method: "reference" | "anchor" | "interpolated" | "estimated" | "pending";
  based_on?: string[];
  sources?: Sources;
  reviewed?: string;
}

/**
 * Ficha de una GPU (dedicada desktop, dedicada laptop o integrada). Índice gaming relativo a NVIDIA GeForce RTX 4060 (desktop) = 100.
 */
export interface GPU {
  id: string;
  brand: "NVIDIA" | "AMD" | "Intel" | "Apple" | "Qualcomm";
  name: string;
  aliases: string[];
  type: "desktop" | "mobile" | "integrated";
  release: string;
  architecture: string;
  /**
   * null en integradas (usan la RAM del sistema).
   */
  vram?: {
    gb: number;
    type?: string;
    bus_bits?: number;
  } | null;
  /**
   * Desktop: min = max = consumo de la tarjeta (TBP). Mobile: rango de TGP permitido por el fabricante.
   */
  power_w?: {
    min: number;
    max: number;
  };
  /**
   * Interfaz PCIe de la tarjeta. Importa en placas de generación anterior cuando usa menos de 16 líneas.
   */
  pcie?: {
    gen: number;
    lanes: 1 | 2 | 4 | 8 | 16;
  };
  /**
   * Potencia teórica FP32 máxima (boost). Base de la estimación automática del índice gaming.
   */
  fp32_tflops?: number;
  features?: {
    ray_tracing?: boolean;
    upscaling?: string[];
    frame_generation?: boolean;
  };
  spec_sources?: Sources;
  scores: GpuScores;
  score_meta: ScoreMeta;
  notes?: string[];
}
export interface GpuScores {
  /**
   * Puntuación con la potencia mínima y máxima de power_w. En desktop ambos valores son iguales.
   */
  gaming: {
    /**
     * Índice relativo a la referencia (= 100). null mientras no se haya estimado.
     */
    at_min_power: number | null;
    /**
     * Índice relativo a la referencia (= 100). null mientras no se haya estimado.
     */
    at_max_power: number | null;
  };
  /**
   * Índice relativo a la referencia (= 100). null mientras no se haya estimado.
   */
  compute?: number | null;
}
