"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { CPU, GPU } from "@/lib/data-types.ts";
import { adjustCpuForMemory, defaultRamGb, laptopMemory, memoryLabel } from "@/lib/memory.ts";
import { laptopCombo, suggestLaptopGpu, type Balance, type Resolution } from "@/lib/pairing.ts";
import { scoreSystem, type ProfilesConfig } from "@/lib/scoring.ts";
import { listEs } from "@/lib/text.ts";
import { ScoreCard } from "./ScoreCard.tsx";

const RESOLUTIONS: [Resolution, string][] = [
  ["1080p", "1080p (Full HD)"],
  ["1440p", "1440p / 1600p (2K)"],
];
const BALANCE_TEXT: Record<Balance, string> = {
  balanced: "Combinación equilibrada",
  "cpu-limited": "La CPU limita a esta GPU",
  "gpu-limited": "La GPU es el límite",
};
const BALANCE_HINT: Record<Balance, string> = {
  balanced: "El procesador y la tarjeta gráfica se aprovechan bien entre sí.",
  "cpu-limited": "En juegos exigentes con el procesador no verás todo el potencial de esta GPU.",
  "gpu-limited": "El procesador daría para una tarjeta gráfica más potente.",
};

/** Pasos de TGP dentro del rango de la GPU (incluye mínimo y máximo). */
function tgpSteps(gpu: GPU): number[] {
  if (!gpu.power_w || gpu.power_w.min === gpu.power_w.max) return [];
  const { min, max } = gpu.power_w;
  const step = max - min > 40 ? 10 : 5;
  const steps = new Set<number>([min]);
  for (let w = Math.ceil(min / step) * step; w < max; w += step) steps.add(w);
  steps.add(max);
  return [...steps].sort((a, b) => a - b);
}

// Notas por uso de una CPU de laptop con memoria editable y GPU opcional para evaluar la combinación.
export function LaptopCpuScores({ cpu, igpu, gpus, config }: { cpu: CPU; igpu: GPU | null; gpus: GPU[]; config: ProfilesConfig }) {
  const memory = useMemo(() => laptopMemory(cpu), [cpu]);
  const [ramGb, setRamGb] = useState(() => defaultRamGb(memory));
  const [memLabel, setMemLabel] = useState(memoryLabel(memory.default));
  // GPU común que mejor se equilibra con este procesador (con la memoria típica), preseleccionada como ejemplo.
  const suggested = useMemo(
    () => suggestLaptopGpu(adjustCpuForMemory(cpu, memory.default), gpus, config),
    [cpu, memory, gpus, config],
  );
  const [gpuId, setGpuId] = useState(() => suggested?.id ?? "");
  const [tgp, setTgp] = useState<number | "">("");
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const id = useId();

  const selectedMemory = memory.options.find((o) => memoryLabel(o) === memLabel) ?? memory.default;
  const adjustedCpu = useMemo(() => adjustCpuForMemory(cpu, selectedMemory), [cpu, selectedMemory]);
  const gpu = gpus.find((g) => g.id === gpuId) ?? null;
  const steps = gpu ? tgpSteps(gpu) : [];

  const usage = useMemo(
    () => scoreSystem({ cpu: adjustedCpu, gpu: igpu, ramGb }, config).filter((r) => r.key !== "gaming"),
    [adjustedCpu, igpu, ramGb, config],
  );
  const combo = useMemo(
    () => (gpu ? laptopCombo(adjustedCpu, gpu, { ramGb, resolution, gpuPowerW: tgp === "" ? undefined : tgp }, config) : null),
    [adjustedCpu, gpu, ramGb, resolution, tgp, config],
  );

  const results = combo ? [...usage, combo.gaming] : usage;
  const recommended = results.filter((r) => r.score !== null && r.score >= 6.5).map((r) => r.label.toLowerCase());
  const memText = `${ramGb} GB ${memoryLabel(selectedMemory)}`;
  const isSuggested = gpu !== null && gpu.id === suggested?.id;
  const setupText = gpu ? `${memText} y ${gpu.name}${isSuggested ? " (sugerida)" : ""}` : memText;

  // GPUs agrupadas por marca, de mayor a menor rendimiento.
  const groups = useMemo(() => {
    const byBrand = new Map<string, GPU[]>();
    for (const g of [...gpus].sort((a, b) => (b.scores.gaming.at_max_power ?? 0) - (a.scores.gaming.at_max_power ?? 0))) {
      byBrand.set(g.brand, [...(byBrand.get(g.brand) ?? []), g]);
    }
    return [...byBrand.entries()];
  }, [gpus]);

  return (
    <>
      <form className="build-form" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Memoria de la laptop</legend>
          <div className="build-grid">
            <div className="field">
              <label htmlFor={`${id}-gb`}>Cantidad de RAM</label>
              <select id={`${id}-gb`} name="ram" value={ramGb} onChange={(e) => setRamGb(Number(e.target.value))}>
                {memory.capacities.map((gb) => <option key={gb} value={gb}>{gb} GB</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-mem`}>Tipo y velocidad</label>
              <select
                id={`${id}-mem`}
                name="memory"
                value={memLabel}
                onChange={(e) => setMemLabel(e.target.value)}
                aria-describedby={`${id}-mem-hint`}
                disabled={memory.options.length === 1}
              >
                {memory.options.map((o) => {
                  const label = memoryLabel(o);
                  return <option key={label} value={label}>{label}{label === memoryLabel(memory.default) ? " (típica)" : ""}</option>;
                })}
              </select>
              <span id={`${id}-mem-hint`} className="hint">
                {memory.soldered
                  ? "En este procesador la memoria va integrada: no se puede ampliar ni cambiar."
                  : `Aparece en la ficha de la laptop (p. ej. «16 GB ${memoryLabel(memory.default)}»).`}
              </span>
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Tarjeta gráfica de la laptop (opcional)</legend>
          <div className="build-grid">
            <div className="field">
              <label htmlFor={`${id}-gpu`}>GPU dedicada</label>
              <select
                id={`${id}-gpu`}
                name="gpu"
                value={gpuId}
                onChange={(e) => {
                  setGpuId(e.target.value);
                  setTgp("");
                }}
                aria-describedby={`${id}-gpu-hint`}
              >
                <option value="">Sin GPU dedicada</option>
                {groups.map(([brand, list]) => (
                  <optgroup key={brand} label={brand}>
                    {list.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}{g.id === suggested?.id ? " (sugerida)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span id={`${id}-gpu-hint`} className="hint">
                {suggested
                  ? isSuggested
                    ? "Preseleccionamos una GPU común que se equilibra bien con este procesador. Cámbiala por la de la laptop que estás mirando."
                    : `Sugerida para este procesador: ${suggested.name}.`
                  : "Los procesadores de bajo consumo rara vez vienen con GPU dedicada."}
              </span>
            </div>
            {gpu && (
              <div className="field">
                <label htmlFor={`${id}-tgp`}>TGP de la GPU</label>
                <select
                  id={`${id}-tgp`}
                  name="tgp"
                  value={tgp}
                  onChange={(e) => setTgp(e.target.value === "" ? "" : Number(e.target.value))}
                  aria-describedby={`${id}-tgp-hint`}
                  disabled={steps.length === 0}
                >
                  <option value="">{steps.length ? "No lo sé" : `${gpu.power_w?.max ?? "?"} W (fijo)`}</option>
                  {steps.map((w) => <option key={w} value={w}>{w} W</option>)}
                </select>
                <span id={`${id}-tgp-hint`} className="hint">
                  Búscalo como «TGP» o «potencia gráfica» en la ficha o review de la laptop.
                </span>
              </div>
            )}
            {gpu && (
              <fieldset className="field">
                <legend>Resolución de la pantalla</legend>
                {RESOLUTIONS.map(([r, label]) => (
                  <label key={r} className="radio">
                    <input type="radio" name="resolution" value={r} checked={resolution === r} onChange={() => setResolution(r)} />
                    {label}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        </fieldset>
      </form>

      <p role="status" className="recommended-line">
        {recommended.length
          ? <>Con {setupText}: <strong>recomendable para {listEs(recommended)}</strong>.</>
          : <>Con {setupText}: no es especialmente recomendable para programar, ofimática exigente ni juegos.</>}
      </p>

      {gpu && combo && (
        <div className="combo" data-balance={combo.balance}>
          <p className="pairing-head">
            <span>
              {cpu.name} + <Link href={`/gpu/${gpu.id}`}>{gpu.name}</Link>
            </span>
            <span className="badge">{BALANCE_TEXT[combo.balance]}</span>
          </p>
          <p className="note">
            {BALANCE_HINT[combo.balance]} Índice de la GPU {tgp === "" ? "" : `a ${tgp} W`}:{" "}
            {combo.gpuRange
              ? `${Math.round(combo.gpuRange[0])}–${Math.round(combo.gpuRange[1])} según el TGP`
              : Math.round(combo.gpuIndex)}{" "}
            (100 = RTX 4060 de escritorio).
          </p>
        </div>
      )}

      <div className="scores">
        {usage.map((r) => <ScoreCard key={r.key} result={r} note={`Con ${memText}.`} />)}
        {combo ? (
          <ScoreCard
            result={combo.gaming}
            note={`Con ${gpu!.name}${tgp === "" ? " (TGP desconocido)" : ` a ${tgp} W`}, en ${resolution}.`}
          />
        ) : (
          <article className="score-card">
            <h3>Juegos</h3>
            <p>{gpu ? "Esta GPU aún no tiene puntuación." : "Elige la tarjeta gráfica de la laptop arriba para ver qué tal es la combinación."}</p>
          </article>
        )}
      </div>
    </>
  );
}
