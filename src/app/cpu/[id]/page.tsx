import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs.tsx";
import { EstimateNotice } from "@/components/EstimateNotice.tsx";
import { DesktopCpuSection } from "@/components/DesktopCpuSection.tsx";
import { LaptopCpuScores } from "@/components/LaptopCpuScores.tsx";
import { ScoreCard } from "@/components/ScoreCard.tsx";
import type { CPU, GPU } from "@/lib/data-types.ts";
import { getCpu, getCpus, getGpu, getGpus, getProfiles, getReferenceCpu } from "@/lib/data.ts";
import { ASSUMED_RAM_GB, SITE_URL, cpuTag, formatIndex, formatRelease, recommendedFor, scoreCpuAlone } from "@/lib/present.ts";

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => getCpus().map((c) => ({ id: c.id }));

const coresText = (cpu: CPU) => {
  const { performance: p, efficiency: e, threads } = cpu.cores;
  return e ? `${p + e} núcleos (${p}P + ${e}E) y ${threads} hilos` : `${p} núcleos y ${threads} hilos`;
};
const fmt = (n: number) => n.toLocaleString("es");

/** GPUs con puntuación del tipo indicado, sin campos que el cliente no necesita. */
const scoredGpus = (type: GPU["type"]): GPU[] =>
  getGpus()
    .filter((g) => g.type === type && g.scores.gaming.at_max_power !== null)
    .map(({ spec_sources: _s, notes: _n, ...g }) => g);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const cpu = getCpu((await params).id);
  if (!cpu) return {};
  const kind = cpu.platform === "mobile" ? "de laptop" : "de escritorio";
  const boost = cpu.clocks_ghz?.boost ? `, hasta ${fmt(cpu.clocks_ghz.boost)} GHz` : "";
  return {
    title: `${cpu.name}: ¿qué tal es? Rendimiento para programar, jugar y ofimática`,
    description: `${cpu.name}: procesador ${kind} de ${cpu.brand} con ${coresText(cpu)}${boost}. Nota por uso, advertencias y para qué es recomendable.`,
    alternates: { canonical: `/cpu/${cpu.id}` },
  };
}

export default async function CpuPage({ params }: Props) {
  const cpu = getCpu((await params).id);
  if (!cpu) notFound();
  const igpu = cpu.igpu ? (getGpu(cpu.igpu) ?? null) : null;
  const results = scoreCpuAlone(cpu, igpu, getProfiles());
  const recommended = recommendedFor(results);
  const reference = getReferenceCpu();
  const pending = cpu.score_meta.method === "pending";
  const kind = cpu.platform === "mobile" ? "Procesador de laptop" : "Procesador de escritorio";
  // Al cliente solo lo que necesita para calcular (sin fuentes ni notas).
  const { spec_sources: _s, notes: _n, ...clientCpu } = cpu;

  const specs: [string, string | null | undefined][] = [
    ["Marca", cpu.brand],
    ["Tipo", kind],
    ["Lanzamiento", formatRelease(cpu.release)],
    ["Arquitectura", cpu.architecture],
    ["Núcleos e hilos", coresText(cpu)],
    ["Frecuencia base", cpu.clocks_ghz?.base ? `${fmt(cpu.clocks_ghz.base)} GHz` : null],
    ["Frecuencia máxima (turbo)", cpu.clocks_ghz?.boost ? `${fmt(cpu.clocks_ghz.boost)} GHz` : null],
    [
      cpu.platform === "mobile" ? "Consumo (configurable)" : "Consumo (TDP)",
      cpu.power_w?.base ? (cpu.power_w.max ? `${cpu.power_w.base}–${cpu.power_w.max} W` : `${cpu.power_w.base} W`) : null,
    ],
    ["Socket", cpu.socket],
    ["Memoria compatible", cpu.memory?.types?.join(", ")],
    ["Gráfica integrada", igpu?.name],
    ["NPU (IA)", cpu.npu_tops ? `${cpu.npu_tops} TOPS` : null],
  ];

  return (
    <article>
      <Breadcrumbs siteUrl={SITE_URL} items={[{ name: "Inicio", href: "/" }, { name: cpu.name, href: `/cpu/${cpu.id}` }]} />
      <header className="chip-header">
        <h1>{cpu.name}</h1>
        <p className="tag">
          {kind} · {cpu.brand} · {formatRelease(cpu.release)}
        </p>
      </header>

      <section className="summary" aria-label="Resumen">
        {pending ? (
          <p>
            Ya tenemos las especificaciones de este procesador, pero <strong>aún no tiene puntuación</strong>. Mientras
            tanto, revisa sus características más abajo.
          </p>
        ) : recommended.length ? (
          <p>
            <strong>Recomendable para {recommended.join(" y ")}</strong> (con {ASSUMED_RAM_GB} GB de RAM). Para juegos,
            lo que más pesa es la tarjeta gráfica.
          </p>
        ) : (
          <p>
            Con {ASSUMED_RAM_GB} GB de RAM no es especialmente recomendable para programar ni para un uso de oficina
            exigente.
          </p>
        )}
      </section>

      {cpu.score_meta.method === "estimated" && <EstimateNotice context="chip" />}

      <h2>Nota por uso</h2>
      {pending ? (
        <div className="scores">
          {results.map((r) => (
            <ScoreCard key={r.key} result={r} note={`Con ${ASSUMED_RAM_GB} GB de RAM.`} />
          ))}
        </div>
      ) : cpu.platform === "mobile" ? (
        <LaptopCpuScores cpu={clientCpu} igpu={igpu} gpus={scoredGpus("mobile")} config={getProfiles()} />
      ) : (
        <DesktopCpuSection cpu={clientCpu} igpu={igpu} gpus={scoredGpus("desktop")} config={getProfiles()} />
      )}

      <h2>Índices de rendimiento</h2>
      <table className="specs">
        <caption className="visually-hidden">Índices de rendimiento de {cpu.name}</caption>
        <tbody>
          <tr>
            <th scope="row">Single-core</th>
            <td>{formatIndex(cpu.scores.single)}</td>
          </tr>
          <tr>
            <th scope="row">Multi-core</th>
            <td>{formatIndex(cpu.scores.multi)}</td>
          </tr>
        </tbody>
      </table>
      <p className="note">
        100 = {reference.name}. Un índice de 150 rinde un 50 % más; uno de 60, un 40 % menos.
        {cpu.score_meta.method === "estimated" && " Estimación automática (ver aviso más arriba)."}
      </p>

      <h2>Especificaciones</h2>
      <table className="specs">
        <caption className="visually-hidden">Especificaciones de {cpu.name}</caption>
        <tbody>
          {specs
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{value}</td>
              </tr>
            ))}
        </tbody>
      </table>

      {cpu.notes?.length ? (
        <>
          <h2>Notas</h2>
          <ul>
            {cpu.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}
