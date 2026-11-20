import type { Metadata } from "next";
import { ChipSearch } from "@/components/ChipSearch.tsx";
import { getCpus, getGpus } from "@/lib/data.ts";
import { toSearchItem } from "@/lib/present.ts";

// Página de resultados para cuando el formulario se envía sin JavaScript. No se indexa.
export const metadata: Metadata = { title: "Buscar", robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  const { q } = await searchParams;
  const query = (Array.isArray(q) ? q[0] : q) ?? "";
  const items = [...getCpus().map((c) => toSearchItem(c, "cpu")), ...getGpus().map((g) => toSearchItem(g, "gpu"))];
  return (
    <>
      <h1>Buscar</h1>
      <ChipSearch items={items} initialQuery={query} />
    </>
  );
}
