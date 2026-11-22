"use client";

import Link from "next/link";
import { useDeferredValue, useId, useMemo, useState } from "react";
import { BASE_PATH } from "@/lib/present.ts";
import { searchChips, type SearchItem } from "@/lib/search.ts";

// Búsqueda con resultados en vivo. Sin JavaScript, el formulario GET lleva a /buscar.
export function ChipSearch({ items, initialQuery = "" }: { items: SearchItem[]; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);
  const deferred = useDeferredValue(query);
  const results = useMemo(() => searchChips(items, deferred), [items, deferred]);
  const id = useId();

  return (
    <search>
      <form action={`${BASE_PATH}/buscar`} method="GET" className="search-form">
        <label htmlFor={`${id}-q`}>Procesador o tarjeta gráfica</label>
        <div className="search-row">
          <input
            id={`${id}-q`}
            type="search"
            name="q"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ej.: i7-13620H, Ryzen 7 7840HS, RTX 4060 Laptop"
            aria-describedby={`${id}-hint`}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="search"
          />
          <button type="submit" className="button">
            Buscar
          </button>
        </div>
        <span id={`${id}-hint`} className="hint">
          Escribe el modelo tal como aparece en la ficha de la laptop o PC.
        </span>
      </form>
      {deferred.trim() && (
        <>
          <p role="status" className="visually-hidden">
            {results.length ? `${results.length} resultados` : "Sin resultados"}
          </p>
          {results.length ? (
            <ul className="results">
              {results.map((r) => (
                <li key={r.id}>
                  <Link href={`/${r.kind}/${r.id}`}>
                    <span>{r.name}</span>
                    <span className="tag">
                      {r.kind === "cpu" ? "CPU" : "GPU"} · {r.tag}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No encontramos ese modelo. Prueba solo con el número, por ejemplo «13620H».</p>
          )}
        </>
      )}
    </search>
  );
}
