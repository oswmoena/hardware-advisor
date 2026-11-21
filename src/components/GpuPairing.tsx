"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { CPU, GPU } from "@/lib/data-types.ts";
import type { ProfilesConfig } from "@/lib/scoring.ts";
import {
  RAM_BASELINE_MTS, RAM_SPEED_OPTIONS, RESOLUTION_LABEL, X3D_GAMING_BONUS, buildWarnings, defaultBuild, isX3D,
  rankGpus, ramTypeFor, type Balance, type BuildMock, type Pairing, type Resolution,
} from "@/lib/pairing.ts";
import { EstimateNotice } from "./EstimateNotice.tsx";

const VISIBLE = 10;
const RAM_OPTIONS = [8, 16, 32, 64];
const PSU_OPTIONS = [450, 550, 650, 750, 850, 1000, 1200];
const BALANCE_TEXT: Record<Balance, string> = {
  balanced: "Equilibrada",
  "cpu-limited": "La CPU la limita",
  "gpu-limited": "GPU modesta para esta CPU",
};
const BALANCE_HINT: Record<Balance, string> = {
  balanced: "Ambos componentes se aprovechan bien.",
  "cpu-limited": "Pagarías por rendimiento que este procesador no alcanza a usar.",
  "gpu-limited": "Funciona, y deja margen para cambiar la GPU más adelante.",
};

export function GpuPairing({ cpu, gpus, config }: { cpu: CPU; gpus: GPU[]; config: ProfilesConfig }) {
  const defaults = useMemo(() => defaultBuild(cpu), [cpu]);
  const [build, setBuild] = useState<BuildMock>(defaults);
  const { recommended, overkill } = useMemo(() => rankGpus(cpu, gpus, build, config), [cpu, gpus, build, config]);
  const systemWarnings = buildWarnings(build, config);
  const id = useId();
  const set = <K extends keyof BuildMock>(key: K, value: BuildMock[K]) => setBuild((b) => ({ ...b, [key]: value }));
  const ramType = ramTypeFor(cpu);
  const estimated = cpu.score_meta.method === "estimated" || gpus.some((g) => g.score_meta.method === "estimated");

  return (
    <section aria-labelledby={`${id}-title`} className="pairing">
      <h2 id={`${id}-title`}>Tarjetas gráficas recomendadas para el {cpu.name}</h2>
      <p>
        Ordenadas de la que mejor aprovecha este procesador a la que peor, para jugar con el equipo de ejemplo. Cambia
        los componentes y la lista se recalcula.
      </p>

      <form className="build-form" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend>Equipo de ejemplo</legend>
          <div className="build-grid">
            <div className="field">
              <label htmlFor={`${id}-ram`}>Memoria RAM ({ramType})</label>
              <select id={`${id}-ram`} name="ram" value={build.ramGb} onChange={(e) => set("ramGb", Number(e.target.value))}>
                {RAM_OPTIONS.map((gb) => <option key={gb} value={gb}>{gb} GB</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-mts`}>Velocidad de la RAM</label>
              <select
                id={`${id}-mts`}
                name="ramMts"
                value={build.ramMts}
                onChange={(e) => set("ramMts", Number(e.target.value))}
                aria-describedby={`${id}-mts-hint`}
              >
                {RAM_SPEED_OPTIONS[ramType].map((mts) => (
                  <option key={mts} value={mts}>
                    {ramType}-{mts}{mts === RAM_BASELINE_MTS[ramType] ? " (típica)" : ""}
                  </option>
                ))}
              </select>
              <span id={`${id}-mts-hint`} className="hint">
                Sobre la velocidad oficial del procesador hay que activar XMP/EXPO en la BIOS.
              </span>
            </div>
            <div className="field">
              <label htmlFor={`${id}-psu`}>Fuente de poder</label>
              <select id={`${id}-psu`} name="psu" value={build.psuW} onChange={(e) => set("psuW", Number(e.target.value))}>
                {PSU_OPTIONS.map((w) => <option key={w} value={w}>{w} W</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor={`${id}-pcie`}>Ranura PCIe de la placa madre</label>
              <select id={`${id}-pcie`} name="pcie" value={build.boardPcieGen} onChange={(e) => set("boardPcieGen", Number(e.target.value))}>
                {[3, 4, 5].map((g) => <option key={g} value={g}>PCIe {g}.0</option>)}
              </select>
            </div>
            <fieldset className="field">
              <legend>Resolución del monitor</legend>
              {(Object.keys(RESOLUTION_LABEL) as Resolution[]).map((r) => (
                <label key={r} className="radio">
                  <input type="radio" name="resolution" value={r} checked={build.resolution === r} onChange={() => set("resolution", r)} />
                  {RESOLUTION_LABEL[r]}
                </label>
              ))}
            </fieldset>
          </div>
          <p className="note">Almacenamiento: SSD NVMe de 1 TB (no cambia el resultado en juegos).</p>
          <button type="button" className="button secondary" onClick={() => setBuild(defaults)}>
            Restablecer equipo típico
          </button>
        </fieldset>
      </form>

      {(estimated || isX3D(cpu)) && (
        <EstimateNotice context="pairing" x3dBonus={isX3D(cpu) ? X3D_GAMING_BONUS : undefined} />
      )}

      {systemWarnings.length > 0 && (
        <ul className="warnings">{systemWarnings.map((w) => <li key={w}>{w}</li>)}</ul>
      )}

      <p role="status" className="visually-hidden">
        {recommended[0] ? `Lista actualizada. Mejor opción: ${recommended[0].gpu.name}.` : "Sin tarjetas para mostrar."}
      </p>

      {recommended.length === 0 ? (
        <p className="muted">Aún no hay tarjetas gráficas puntuadas para comparar.</p>
      ) : (
        <>
          <ol className="pairings">{recommended.slice(0, VISIBLE).map((p) => <PairingItem key={p.gpu.id} p={p} />)}</ol>
          {recommended.length > VISIBLE && (
            <details className="more">
              <summary>Ver las {recommended.length - VISIBLE} restantes</summary>
              <ol className="pairings" start={VISIBLE + 1}>
                {recommended.slice(VISIBLE).map((p) => <PairingItem key={p.gpu.id} p={p} />)}
              </ol>
            </details>
          )}
        </>
      )}

      {overkill.length > 0 && (
        <details className="more">
          <summary>Más potentes de lo que este procesador aprovecha ({overkill.length})</summary>
          <p className="note">
            Funcionan, pero con este procesador y a {RESOLUTION_LABEL[build.resolution]} rinden casi lo mismo que las
            primeras de la lista. Tienen sentido si planeas cambiar el procesador o subir la resolución.
          </p>
          <ol className="pairings">{overkill.map((p) => <PairingItem key={p.gpu.id} p={p} />)}</ol>
        </details>
      )}
    </section>
  );
}

function PairingItem({ p }: { p: Pairing }) {
  const { gpu, gaming } = p;
  const details = [
    gpu.vram && `${gpu.vram.gb} GB ${gpu.vram.type ?? ""}`.trim(),
    gpu.power_w && `${gpu.power_w.max} W`,
    gpu.pcie && `PCIe ${gpu.pcie.gen}.0 x${gpu.pcie.lanes}`,
  ].filter(Boolean);
  return (
    <li className="pairing-item" data-balance={p.balance}>
      <div className="pairing-head">
        <Link href={`/gpu/${gpu.id}`}>{gpu.name}</Link>
        <span className="badge">{BALANCE_TEXT[p.balance]}</span>
      </div>
      <p className="pairing-meta">
        {gaming.score !== null && (
          <>Juegos: <strong>{gaming.score.toLocaleString("es")} / 10</strong> ({gaming.verdict}) · </>
        )}
        {details.join(" · ")}
      </p>
      {p.balance !== "balanced" && <p className="note">{BALANCE_HINT[p.balance]}</p>}
      {p.warnings.length > 0 && <ul className="warnings">{p.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
    </li>
  );
}
