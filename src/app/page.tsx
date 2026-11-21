import { ChipSearch } from "@/components/ChipSearch.tsx";
import { getCpus, getGpus, getTops } from "@/lib/data.ts";
import { toSearchItem } from "@/lib/present.ts";

export default function Home() {
  const cpus = getCpus();
  const gpus = getGpus();
  const tops = getTops();
  const items = [...cpus.map((c) => toSearchItem(c, "cpu")), ...gpus.map((g) => toSearchItem(g, "gpu"))];

  return (
    <>
      <h1>¿Qué tal es este procesador?</h1>
      <p className="lead">
        Busca el procesador o la tarjeta gráfica de la laptop o PC que estás mirando y te decimos qué tal anda para
        jugar, programar o trabajar, con advertencias claras.
      </p>
      <ChipSearch items={items} />

      <h2>Cómo leer las notas</h2>
      <p>
        Cada chip tiene un <strong>índice de rendimiento</strong> donde 100 es el mejor actual: hoy, el{" "}
        {tops.cpuGaming.name} para jugar y la {tops.gpuGaming.name} entre las tarjetas gráficas. Cuando salga una
        generación más potente, pasará a ser el 100 y el resto se ajustará.
      </p>
      <p>
        Aparte está la <strong>nota de 0 a 10</strong> para cada uso (juegos, programación, multitarea, ofimática). Esa
        nota no baja con los lanzamientos nuevos: mide qué tan bien anda el equipo hoy con los programas y juegos
        actuales.
      </p>
      <p className="muted">
        Hoy tenemos {cpus.length} procesadores y {gpus.length} tarjetas gráficas. Las notas se van completando: si un
        chip aparece como «Pendiente», sus especificaciones ya están, pero aún no tiene puntuación.
      </p>
    </>
  );
}
