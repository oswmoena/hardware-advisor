// Aviso visible de que los valores son estimaciones automáticas y de su margen de error.
export const ESTIMATE_MARGIN = "±15 %";

export function EstimateNotice({ context, x3dBonus }: { context: "chip" | "pairing"; x3dBonus?: number }) {
  return (
    <div className="notice" role="note">
      <p className="notice-title">
        <span aria-hidden="true">⚠ </span>
        Aviso: valores estimados
      </p>
      <ul>
        <li>
          Los índices se calculan automáticamente a partir de las especificaciones, con una fórmula que calibramos a mano
          contra resultados públicos. Pueden desviarse alrededor de <strong>{ESTIMATE_MARGIN}</strong> del rendimiento
          real.
        </li>
        {context === "pairing" && (
          <li>
            El orden sirve para detectar desbalances claros (por ejemplo, una GPU muy superior al procesador). Entre
            tarjetas con notas parecidas, la diferencia puede no ser real.
          </li>
        )}
        {x3dBonus !== undefined && (
          <li>
            Este procesador tiene caché 3D (X3D): para juegos le sumamos un {Math.round(x3dBonus * 100)} % a su capacidad,
            porque esa caché rinde más en juegos de lo que sugieren su frecuencia y sus núcleos.
          </li>
        )}
      </ul>
    </div>
  );
}
