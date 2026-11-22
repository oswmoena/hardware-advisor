"use client";

import { useSearchParams } from "next/navigation";
import { ChipSearch } from "@/components/ChipSearch.tsx";
import type { SearchItem } from "@/lib/search.ts";

// Abre el buscador con la consulta de ?q= (en un sitio estático solo el navegador conoce la URL).
export function SearchFromUrl({ items }: { items: SearchItem[] }) {
  const query = useSearchParams().get("q") ?? "";
  return <ChipSearch key={query} items={items} initialQuery={query} />;
}
