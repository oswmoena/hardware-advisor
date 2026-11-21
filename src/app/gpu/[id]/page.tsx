import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/Breadcrumbs.tsx";
import { EstimateNotice } from "@/components/EstimateNotice.tsx";
import { ScoreCard } from "@/components/ScoreCard.tsx";
import type { GPU } from "@/lib/data-types.ts";
import { getGpu, getGpus, getProfiles, getReferenceCpu, getReferenceGpu } from "@/lib/data.ts";
import { ASSUMED_RAM_GB, SITE_URL, formatIndex, formatRelease, scoreGpuAlone } from "@/lib/present.ts";
import { gpuGamingIndex } from "@/lib/scoring.ts";

type Props = { params: Promise<{ id: string }> };

export const dynamicParams = false;
export const generateStaticParams = () => getGpus().map((g) => ({ id: g.id }));

const KIND = { desktop: "Tarjeta gráfica de escritorio", mobile: "Tarjeta gráfica de laptop", integrated: "Gráfica integrada" } as const;
const powerText = (gpu: GPU) =>
  gpu.power_w ? (gpu.power_w.min === gpu.power_w.max ? `${gpu.power_w.max} W` : `${gpu.power_w.min}–${gpu.power_w.max} W (TGP)`) : null;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const gpu = getGpu((await params).id);
  if (!gpu) return {};
  const vram = gpu.vram ? ` con ${gpu.vram.gb} GB de VRAM` : "";
  return {
    title: `${gpu.name}: ¿qué tal es para jugar? Rendimiento y recomendaciones`,
    description: `${gpu.name}: ${KIND[gpu.type].toLowerCase()} de ${gpu.brand}${vram}. Nota para juegos, advertencias y qué esperar según su consumo.`,
    alternates: { canonical: `/gpu/${gpu.id}` },
  };
}

export default async function GpuPage({ params }: Props) {
  const gpu = getGpu((await params).id);
  if (!gpu) notFound();
  const referenceCpu = getReferenceCpu();
  const referenceGpu = getReferenceGpu();
  const gaming = scoreGpuAlone(gpu, referenceCpu, getProfiles());
  const index = gpuGamingIndex(gpu);
  const pending = gpu.score_meta.method === "pending";

  const indexText = index.range
    ? `${formatIndex(index.range[0])} a ${formatIndex(index.range[1])} según el TGP`
    : formatIndex(index.value);

  const specs: [string, string | null | undefined][] = [
    ["Marca", gpu.brand],
    ["Tipo", KIND[gpu.type]],
    ["Lanzamiento", formatRelease(gpu.release)],
    ["Arquitectura", gpu.architecture],
    ["Memoria (VRAM)", gpu.vram ? [`${gpu.vram.gb} GB`, gpu.vram.type, gpu.vram.bus_bits && `${gpu.vram.bus_bits} bits`].filter(Boolean).join(" · ") : gpu.type === "integrated" ? "Usa la RAM del sistema" : null],
    ["Consumo", powerText(gpu)],
    ["Ray tracing", gpu.features?.ray_tracing === undefined ? null : gpu.features.ray_tracing ? "Sí" : "No"],
    ["Escalado por IA", gpu.features?.upscaling?.join(", ")],
    ["Generación de fotogramas", gpu.features?.frame_generation === undefined ? null : gpu.features.frame_generation ? "Sí" : "No"],
  ];

  return (
    <article>
      <Breadcrumbs siteUrl={SITE_URL} items={[{ name: "Inicio", href: "/" }, { name: gpu.name, href: `/gpu/${gpu.id}` }]} />
      <header className="chip-header">
        <h1>{gpu.name}</h1>
        <p className="tag">
          {KIND[gpu.type]} · {gpu.brand} · {formatRelease(gpu.release)}
        </p>
      </header>

      <section className="summary" aria-label="Resumen">
        {pending || !gaming || gaming.score === null ? (
          <p>
            Ya tenemos las especificaciones de esta gráfica, pero <strong>aún no tiene puntuación</strong>.
          </p>
        ) : gaming.score >= 6.5 ? (
          <p>
            <strong>Recomendable para jugar</strong> ({gaming.verdict?.toLowerCase()}).
          </p>
        ) : (
          <p>
            Para jugar es <strong>{gaming.verdict?.toLowerCase()}</strong>: apunta a juegos livianos o calidad baja.
          </p>
        )}
      </section>

      {gpu.score_meta.method === "estimated" && <EstimateNotice context="chip" />}

      <h2>Nota para juegos</h2>
      <div className="scores">
        {gaming && (
          <ScoreCard
            result={gaming}
            note={`Con un procesador equivalente al ${referenceCpu.name} y ${ASSUMED_RAM_GB} GB de RAM.`}
          />
        )}
      </div>

      <h2>Índice de rendimiento</h2>
      <table className="specs">
        <caption className="visually-hidden">Índices de rendimiento de {gpu.name}</caption>
        <tbody>
          <tr>
            <th scope="row">Juegos</th>
            <td>{indexText}</td>
          </tr>
        </tbody>
      </table>
      <p className="note">
        100 = {referenceGpu.name} (escritorio).
        {gpu.score_meta.method === "estimated" && " Estimación automática (ver aviso más arriba)."}
      </p>

      <h2>Especificaciones</h2>
      <table className="specs">
        <caption className="visually-hidden">Especificaciones de {gpu.name}</caption>
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

      {gpu.notes?.length ? (
        <>
          <h2>Notas</h2>
          <ul>
            {gpu.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </>
      ) : null}
    </article>
  );
}
