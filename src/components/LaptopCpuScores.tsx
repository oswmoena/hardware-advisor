"use client";

import { useId, useMemo, useState } from "react";
import type { CPU, GPU } from "@/lib/data-types.ts";
import { adjustCpuForMemory, defaultRamGb, laptopMemory, memoryLabel } from "@/lib/memory.ts";
import { scoreSystem, type ProfilesConfig } from "@/lib/scoring.ts";
import { ScoreCard } from "./ScoreCard.tsx";

// Notas por uso de una CPU de laptop con RAM y memoria editables.
export function LaptopCpuScores({ cpu, igpu, config }: { cpu: CPU; igpu: GPU | null; config: ProfilesConfig }) {
  const memory = useMemo(() => laptopMemory(cpu), [cpu]);
  const [ramGb, setRamGb] = useState(() => defaultRamGb(memory));
  const [memLabel, setMemLabel] = useState(memoryLabel(memory.default));
  const selected = memory.options.find((o) => memoryLabel(o) === memLabel) ?? memory.default;
  const id = useId();

  const results = useMemo(
    () => scoreSystem({ cpu: adjustCpuForMemory(cpu, selected), gpu: igpu, ramGb }, config).filter((r) => r.key !== "gaming"),
    [cpu, igpu, ramGb, selected, config],
  );
  const recommended = results.filter((r) => r.score !== null && r.score >= 6.5).map((r) => r.label.toLowerCase());
  const config_ = `${ramGb} GB ${memoryLabel(selected)}`;

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
      </form>

      <p role="status" className="recommended-line">
        {recommended.length
          ? <>Con {config_}: <strong>recomendable para {recommended.join(" y ")}</strong>.</>
          : <>Con {config_}: no es especialmente recomendable para programar ni para ofimática exigente.</>}
      </p>

      <div className="scores">
        {results.map((r) => <ScoreCard key={r.key} result={r} note={`Con ${config_}.`} />)}
        <article className="score-card">
          <h3>Juegos</h3>
          <p>Depende sobre todo de la tarjeta gráfica de la laptop.</p>
          <p className="note">Revisa también su TGP: la misma GPU rinde muy distinto según la laptop.</p>
        </article>
      </div>
    </>
  );
}
