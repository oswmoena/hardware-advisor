import { ChipSearch } from "@/components/ChipSearch.tsx";
import { getCpus, getGpus } from "@/lib/data.ts";
import { toSearchItem } from "@/lib/present.ts";

export default function Home() {
  const cpus = getCpus();
  const gpus = getGpus();
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
        Cada chip tiene un <strong>índice de rendimiento</strong> donde 100 es un chip de referencia de gama media: el AMD
        Ryzen 5 7600 para procesadores y la NVIDIA GeForce RTX 4060 para tarjetas gráficas. Con esos índices calculamos
        una nota de 0 a 10 para cada uso.
      </p>
      <p className="muted">
        Hoy tenemos {cpus.length} procesadores y {gpus.length} tarjetas gráficas. Las notas se van completando: si un
        chip aparece como «Pendiente», sus especificaciones ya están, pero aún no tiene puntuación.
      </p>
    </>
  );
}
