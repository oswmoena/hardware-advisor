"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { CPU, GPU } from "@/lib/data-types.ts";
import { adjustCpuForMemory, defaultRamGb, laptopMemory, memoryLabel } from "@/lib/memory.ts";
import { laptopCombo, suggestLaptopGpu, type Balance, type Resolution } from "@/lib/pairing.ts";
import { scoreSystem, type ProfilesConfig } from "@/lib/scoring.ts";
import { matchGpu } from "@/lib/search.ts";
import { relative, type Top } from "@/lib/scale.ts";
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

/** Margen por sobre el TGP oficial que suelen anunciar las laptops con Dynamic Boost incluido. */
const DYNAMIC_BOOST_EXTRA_W = 25;

/** Pasos de TGP de 5 W: rango oficial y, por sobre el máximo, valores con Dynamic Boost. */
function tgpSteps(gpu: GPU): number[] {
  if (!gpu.power_w) return [];
  const { min, max } = gpu.power_w;
  const steps = new Set<number>([min, max]);
  for (let w = Math.ceil(min / 5) * 5; w <= max + DYNAMIC_BOOST_EXTRA_W; w += 5) steps.add(w);
  return [...steps].sort((a, b) => a - b);
}

/** Texto del campo de TGP → vatios; "" = no lo sabe; null = no es un número válido. */
function parseTgp(text: string): number | "" | null {
  const t = text.trim();
  if (!t) return "";
  const m = t.replace(",", ".").match(/^(\d{1,3}(?:\.\d+)?)\s*w?$/i);
  if (!m) return null;
  const w = Math.round(Number(m[1]));
  return w > 0 && w <= 400 ? w : null;
}

// Notas por uso de una CPU de laptop con memoria editable y GPU opcional para evaluar la combinación.
export function LaptopCpuScores({
  cpu, igpu, gpus, config, topGpu,
}: { cpu: CPU; igpu: GPU | null; gpus: GPU[]; config: ProfilesConfig; topGpu: Top }) {
  const memory = useMemo(() => laptopMemory(cpu), [cpu]);
  const [ramGb, setRamGb] = useState(() => defaultRamGb(memory));
  const [memLabel, setMemLabel] = useState(memoryLabel(memory.default));
  // GPU común que mejor se equilibra con este procesador (con la memoria típica), preseleccionada como ejemplo.
  const suggested = useMemo(
    () => suggestLaptopGpu(adjustCpuForMemory(cpu, memory.default), gpus, config),
    [cpu, memory, gpus, config],
  );
  const [gpuQuery, setGpuQuery] = useState(() => suggested?.name ?? "");
  const [tgpText, setTgpText] = useState("");
  const parsedTgp = parseTgp(tgpText);
  // Un texto inválido se trata como "no lo sé" mientras se corrige (la pista lo indica).
  const tgp: number | "" = parsedTgp === null ? "" : parsedTgp;
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const id = useId();

  const selectedMemory = memory.options.find((o) => memoryLabel(o) === memLabel) ?? memory.default;
  const adjustedCpu = useMemo(() => adjustCpuForMemory(cpu, selectedMemory), [cpu, selectedMemory]);
  const findGpu = (query: string) => matchGpu(gpus, query);
  const gpu = useMemo(() => matchGpu(gpus, gpuQuery), [gpus, gpuQuery]);
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

  // Sugerencias del campo de GPU: de mayor a menor rendimiento.
  const sortedGpus = useMemo(
    () => [...gpus].sort((a, b) => (b.scores.gaming.at_max_power ?? 0) - (a.scores.gaming.at_max_power ?? 0)),
    [gpus],
  );

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
              <input
                id={`${id}-gpu`}
                type="search"
                name="gpu"
                list={`${id}-gpu-list`}
                value={gpuQuery}
                placeholder="Ej.: RTX 4060, RX 7600S, Arc A770M"
                onChange={(e) => {
                  const next = findGpu(e.target.value);
                  if (next?.id !== gpu?.id) setTgpText("");
                  setGpuQuery(e.target.value);
                }}
                aria-describedby={`${id}-gpu-hint`}
                aria-invalid={gpuQuery.trim() !== "" && !gpu ? true : undefined}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="none"
                spellCheck={false}
                enterKeyHint="done"
              />
              <datalist id={`${id}-gpu-list`}>
                {sortedGpus.map((g) => (
                  <option key={g.id} value={g.name}>
                    {g.id === suggested?.id ? "Sugerida" : g.brand}
                  </option>
                ))}
              </datalist>
              <span id={`${id}-gpu-hint`} className="hint">
                {gpuQuery.trim() !== "" && !gpu
                  ? "No encontramos esa GPU o hay varias que coinciden: sigue escribiendo o elige una de la lista."
                  : gpuQuery.trim() === ""
                    ? suggested
                      ? `Sin GPU dedicada. Sugerida para este procesador: ${suggested.name}.`
                      : "Sin GPU dedicada. Los procesadores de bajo consumo rara vez la traen."
                    : isSuggested
                      ? "Sugerida: una GPU común que se equilibra bien con este procesador. Cámbiala por la de la laptop que estás mirando."
                      : "Borra el campo para evaluar la laptop sin GPU dedicada."}
              </span>
            </div>
            {gpu && (
              <div className="field">
                <label htmlFor={`${id}-tgp`}>TGP de la GPU (W)</label>
                <input
                  id={`${id}-tgp`}
                  type="text"
                  inputMode="numeric"
                  name="tgp"
                  list={`${id}-tgp-list`}
                  value={tgpText}
                  placeholder="No lo sé (ej.: 115)"
                  onChange={(e) => setTgpText(e.target.value)}
                  aria-describedby={`${id}-tgp-hint`}
                  aria-invalid={parsedTgp === null ? true : undefined}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="done"
                />
                <datalist id={`${id}-tgp-list`}>
                  {steps.map((w) => (
                    <option key={w} value={String(w)}>
                      {w} W{gpu.power_w && w > gpu.power_w.max ? " (con Dynamic Boost)" : ""}
                    </option>
                  ))}
                </datalist>
                <span id={`${id}-tgp-hint`} className="hint">
                  {parsedTgp === null
                    ? "Escribe solo los vatios, por ejemplo «115». Mientras tanto se evalúa como «no lo sé»."
                    : <>
                        Búscalo como «TGP» o «potencia gráfica» en la ficha o review de la laptop; déjalo vacío si no lo
                        sabes. Oficial:{" "}
                        {gpu.power_w ? (gpu.power_w.min === gpu.power_w.max ? `${gpu.power_w.max} W` : `${gpu.power_w.min}–${gpu.power_w.max} W`) : "sin dato"}.
                      </>}
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
            {BALANCE_HINT[combo.balance]} Índice de la GPU{tgp === "" ? "" : ` a ${tgp} W`}:{" "}
            {combo.gpuRange
              ? `${relative(combo.gpuRange[0], topGpu)}–${relative(combo.gpuRange[1], topGpu)} / 100 según el TGP`
              : `${relative(combo.gpuIndex, topGpu)} / 100`}{" "}
            (100 = {topGpu.name}, la más potente actual).
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
