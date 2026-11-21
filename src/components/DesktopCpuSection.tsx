"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import type { CPU, GPU } from "@/lib/data-types.ts";
import { adjustCpuForMemorySpeed } from "@/lib/memory.ts";
import {
  RAM_BASELINE_MTS, RAM_SPEED_OPTIONS, RESOLUTION_LABEL, buildWarnings, defaultBuild, isX3D, x3dBonus,
  pairGpu, rankGpus, ramTypeFor, type Balance, type BuildMock, type Pairing, type Resolution,
} from "@/lib/pairing.ts";
import { relative, type Top } from "@/lib/scale.ts";
import { scoreSystem, type ProfileResult, type ProfilesConfig } from "@/lib/scoring.ts";
import { matchGpu } from "@/lib/search.ts";
import { listEs } from "@/lib/text.ts";
import { EstimateNotice } from "./EstimateNotice.tsx";
import { ScoreCard } from "./ScoreCard.tsx";

const VISIBLE = 10;
/** Desde 4 GB por los equipos más antiguos; 24 y 48 GB son comunes con módulos DDR5 actuales. */
const RAM_OPTIONS = [4, 8, 12, 16, 24, 32, 48, 64];
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

// Ficha de una CPU de escritorio: un solo equipo de ejemplo editable que mueve las notas por uso
// y la lista de tarjetas gráficas recomendadas.
export function DesktopCpuSection({
  cpu, igpu, gpus, config, topGpu,
}: { cpu: CPU; igpu: GPU | null; gpus: GPU[]; config: ProfilesConfig; topGpu: Top }) {
  const defaults = useMemo(() => defaultBuild(cpu), [cpu]);
  const [build, setBuild] = useState<BuildMock>(defaults);
  const ramType = ramTypeFor(cpu);
  const comboId = useId();

  // GPU sugerida: la primera de la lista de recomendadas con el equipo típico (estable aunque cambie el equipo).
  const suggested = useMemo(() => rankGpus(cpu, gpus, defaults, config).recommended[0]?.gpu ?? null, [cpu, gpus, defaults, config]);
  const [gpuQuery, setGpuQuery] = useState(() => suggested?.name ?? "");
  const gpu = useMemo(() => matchGpu(gpus, gpuQuery), [gpus, gpuQuery]);
  const isSuggested = gpu !== null && gpu.id === suggested?.id;

  const usage = useMemo(() => {
    const adjusted = adjustCpuForMemorySpeed(cpu, build.ramMts, RAM_BASELINE_MTS[ramType]);
    return scoreSystem({ cpu: adjusted, gpu: igpu, ramGb: build.ramGb }, config).filter((r) => r.key !== "gaming");
  }, [cpu, igpu, build.ramGb, build.ramMts, ramType, config]);
  // pairGpu aplica por su cuenta la velocidad de la RAM, la ranura PCIe, la fuente y la resolución.
  const combo = useMemo(() => (gpu ? pairGpu(cpu, gpu, build, config) : null), [cpu, gpu, build, config]);
  const gaming: ProfileResult | null = combo
    ? { ...combo.gaming, warnings: [...combo.gaming.warnings.filter((w) => !w.includes("VRAM")), ...combo.warnings] }
    : null;

  const results = gaming ? [...usage, gaming] : usage;
  const recommended = results.filter((r) => r.score !== null && r.score >= 6.5).map((r) => r.label.toLowerCase());
  const ramText = `${build.ramGb} GB ${ramType}-${build.ramMts}`;
  const setupText = gpu ? `${ramText} y ${gpu.name}${isSuggested ? " (sugerida)" : ""}` : ramText;

  const tryGpu = (g: GPU) => {
    setGpuQuery(g.name);
    document.getElementById(comboId)?.scrollIntoView({ block: "center" });
  };

  return (
    <>
      <BuildForm
        cpu={cpu} build={build} defaults={defaults} onChange={setBuild}
        gpus={gpus} gpuQuery={gpuQuery} onGpuQuery={setGpuQuery} gpu={gpu} suggested={suggested}
      />

      <p role="status" className="recommended-line">
        {recommended.length
          ? <>Con {setupText}: <strong>recomendable para {listEs(recommended)}</strong>.</>
          : <>Con {setupText}: no es especialmente recomendable para programar, ofimática exigente ni juegos.</>}
      </p>

      <div id={comboId}>
        {gpu && combo && (
          <div className="combo" data-balance={combo.balance}>
            <p className="pairing-head">
              <span>
                {cpu.name} + <Link href={`/gpu/${gpu.id}`}>{gpu.name}</Link>
              </span>
              <span className="badge">{BALANCE_TEXT[combo.balance]}</span>
            </p>
            <p className="note">
              {BALANCE_HINT[combo.balance]} Índice de la GPU: {relative(gpu.scores.gaming.at_max_power, topGpu)} / 100 (100 ={" "}
              {topGpu.name}, la más potente actual). Fuente recomendada para este par: {combo.recommendedPsuW} W.
            </p>
          </div>
        )}
      </div>

      <div className="scores">
        {usage.map((r) => <ScoreCard key={r.key} result={r} note={`Con ${ramText}.`} />)}
        {gaming ? (
          <ScoreCard result={gaming} note={`Con ${gpu!.name}, en ${RESOLUTION_LABEL[build.resolution]}.`} />
        ) : (
          <article className="score-card">
            <h3>Juegos</h3>
            <p>{gpu ? "Esta GPU aún no tiene puntuación." : "Elige una tarjeta gráfica arriba para ver qué tal es la combinación."}</p>
            <p className="note">Más abajo tienes las que mejor aprovechan este procesador con el equipo de ejemplo.</p>
          </article>
        )}
      </div>

      <GpuRanking cpu={cpu} gpus={gpus} build={build} config={config} selectedId={gpu?.id} onTry={tryGpu} />
    </>
  );
}

interface BuildFormProps {
  cpu: CPU;
  build: BuildMock;
  defaults: BuildMock;
  onChange: (b: BuildMock) => void;
  gpus: GPU[];
  gpuQuery: string;
  onGpuQuery: (q: string) => void;
  gpu: GPU | null;
  suggested: GPU | null;
}

function BuildForm({ cpu, build, defaults, onChange, gpus, gpuQuery, onGpuQuery, gpu, suggested }: BuildFormProps) {
  const id = useId();
  const ramType = ramTypeFor(cpu);
  const set = <K extends keyof BuildMock>(key: K, value: BuildMock[K]) => onChange({ ...build, [key]: value });
  const sortedGpus = useMemo(
    () => [...gpus].sort((a, b) => (b.scores.gaming.at_max_power ?? 0) - (a.scores.gaming.at_max_power ?? 0)),
    [gpus],
  );
  const typed = gpuQuery.trim() !== "";

  return (
    <form className="build-form" onSubmit={(e) => e.preventDefault()}>
      <fieldset>
        <legend>Equipo de ejemplo</legend>
        <div className="build-grid">
          <div className="field">
            <label htmlFor={`${id}-gpu`}>Tarjeta gráfica</label>
            <input
              id={`${id}-gpu`}
              type="search"
              name="gpu"
              list={`${id}-gpu-list`}
              value={gpuQuery}
              placeholder="Ej.: RTX 4070, RX 7800 XT, Arc B580"
              onChange={(e) => onGpuQuery(e.target.value)}
              aria-describedby={`${id}-gpu-hint`}
              aria-invalid={typed && !gpu ? true : undefined}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="done"
            />
            <datalist id={`${id}-gpu-list`}>
              {sortedGpus.map((g) => (
                <option key={g.id} value={g.name}>{g.id === suggested?.id ? "Sugerida" : g.brand}</option>
              ))}
            </datalist>
            <span id={`${id}-gpu-hint`} className="hint">
              {typed && !gpu
                ? "No encontramos esa GPU o hay varias que coinciden: sigue escribiendo o elige una de la lista."
                : !typed
                  ? `Sin tarjeta gráfica elegida.${suggested ? ` Sugerida para este procesador: ${suggested.name}.` : ""}`
                  : gpu?.id === suggested?.id
                    ? "Sugerida: la que mejor aprovecha este procesador con el equipo típico. Cámbiala por la que estés mirando."
                    : "Borra el campo para ver solo el procesador."}
            </span>
          </div>
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
        <p className="note">
          La RAM afecta a todas las notas; la tarjeta gráfica, la fuente, la ranura PCIe y la resolución, a la nota de
          juegos y a la lista de tarjetas gráficas. Almacenamiento: SSD NVMe de 1 TB (no cambia el resultado).
        </p>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            onChange(defaults);
            onGpuQuery(suggested?.name ?? "");
          }}
        >
          Restablecer equipo típico
        </button>
      </fieldset>
    </form>
  );
}

interface GpuRankingProps {
  cpu: CPU;
  gpus: GPU[];
  build: BuildMock;
  config: ProfilesConfig;
  selectedId?: string;
  onTry: (gpu: GPU) => void;
}

function GpuRanking({ cpu, gpus, build, config, selectedId, onTry }: GpuRankingProps) {
  const item = (p: Pairing) => <PairingItem key={p.gpu.id} p={p} selected={p.gpu.id === selectedId} onTry={onTry} />;
  const { recommended, overkill } = useMemo(() => rankGpus(cpu, gpus, build, config), [cpu, gpus, build, config]);
  const systemWarnings = buildWarnings(build, config);
  const estimated = cpu.score_meta.method === "estimated" || gpus.some((g) => g.score_meta.method === "estimated");
  const id = useId();

  return (
    <section aria-labelledby={`${id}-title`} className="pairing">
      <h2 id={`${id}-title`}>Tarjetas gráficas recomendadas para el {cpu.name}</h2>
      <p>Ordenadas de la que mejor aprovecha este procesador a la que peor, para jugar con el equipo de ejemplo de arriba.</p>

      {(estimated || isX3D(cpu)) && <EstimateNotice context="pairing" x3dBonus={isX3D(cpu) ? x3dBonus(cpu) : undefined} />}

      {systemWarnings.length > 0 && <ul className="warnings">{systemWarnings.map((w) => <li key={w}>{w}</li>)}</ul>}

      <p role="status" className="visually-hidden">
        {recommended[0] ? `Lista actualizada. Mejor opción: ${recommended[0].gpu.name}.` : "Sin tarjetas para mostrar."}
      </p>

      {recommended.length === 0 ? (
        <p className="muted">Aún no hay tarjetas gráficas puntuadas para comparar.</p>
      ) : (
        <>
          <ol className="pairings">{recommended.slice(0, VISIBLE).map(item)}</ol>
          {recommended.length > VISIBLE && (
            <details className="more">
              <summary>Ver las {recommended.length - VISIBLE} restantes</summary>
              <ol className="pairings" start={VISIBLE + 1}>
                {recommended.slice(VISIBLE).map(item)}
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
          <ol className="pairings">{overkill.map(item)}</ol>
        </details>
      )}
    </section>
  );
}

function PairingItem({ p, selected, onTry }: { p: Pairing; selected: boolean; onTry: (gpu: GPU) => void }) {
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
        {gaming.score !== null && <>Juegos: <strong>{gaming.score.toLocaleString("es")} / 10</strong> ({gaming.verdict}) · </>}
        {details.join(" · ")}
      </p>
      {p.balance !== "balanced" && <p className="note">{BALANCE_HINT[p.balance]}</p>}
      {p.warnings.length > 0 && <ul className="warnings">{p.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      {selected ? (
        <p className="note"><strong>Es la que estás evaluando arriba.</strong></p>
      ) : (
        <button type="button" className="button secondary small" onClick={() => onTry(gpu)}>
          Probar en el equipo<span className="visually-hidden">: {gpu.name}</span>
        </button>
      )}
    </li>
  );
}
