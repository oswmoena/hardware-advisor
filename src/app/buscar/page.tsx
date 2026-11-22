import type { Metadata } from "next";
import { Suspense } from "react";
import { ChipSearch } from "@/components/ChipSearch.tsx";
import { SearchFromUrl } from "@/components/SearchFromUrl.tsx";
import { getCpus, getGpus } from "@/lib/data.ts";
import { toSearchItem } from "@/lib/present.ts";

// Destino del formulario de búsqueda (GET ?q=). El sitio es estático, así que la consulta se lee en el
// navegador; mientras carga se muestra el buscador vacío. No se indexa.
export const metadata: Metadata = { title: "Buscar", robots: { index: false, follow: true } };

export default function SearchPage() {
  const items = [...getCpus().map((c) => toSearchItem(c, "cpu")), ...getGpus().map((g) => toSearchItem(g, "gpu"))];
  return (
    <>
      <h1>Buscar</h1>
      <Suspense fallback={<ChipSearch items={items} />}>
        <SearchFromUrl items={items} />
      </Suspense>
    </>
  );
}
