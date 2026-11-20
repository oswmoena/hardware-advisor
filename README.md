# hardware-advisor

Consulta de rendimiento de CPUs y GPUs (laptops y desktops) con una nota por uso
(juegos, programación, ofimática), advertencias concretas y un "recomendable para…".
Más adelante: comparación lado a lado y guía para armar PC.

## Cómo se puntúa

Cada chip tiene un **índice relativo a un chip de referencia = 100**:

| Categoría | Referencia | Índices |
|---|---|---|
| CPU | AMD Ryzen 5 7600 (desktop) | `single`, `multi` |
| GPU | NVIDIA GeForce RTX 4060 (desktop) | `gaming`, `compute` |

Un índice de 150 rinde un 50% más que la referencia; uno de 60, un 40% menos.
Los chips nuevos simplemente superan 100, sin recalcular nada.

Las GPUs de laptop guardan la puntuación con la potencia (TGP) mínima y máxima,
porque una misma GPU rinde muy distinto según cómo la configure el fabricante.

Las notas de 0 a 10 por uso **no se guardan**: se calculan con `scoring/profiles.json`
(curvas índice → nota, pesos por uso y reglas que limitan la nota y agregan advertencias).

## Estructura

```
data/
  schema/   JSON Schema (cpu, gpu, common)
  cpus/     una lista por marca: intel.json, amd.json, apple.json, qualcomm.json
  gpus/     ídem (incluye integradas)
  raw/      tablas descargadas de Wikipedia (no se versiona)
scoring/
  profiles.json
scripts/
  validate.mjs         valida los datos contra el schema y reglas de consistencia
  fetch-wikipedia.mjs  descarga tablas de especificaciones desde la API de Wikipedia
  import-cpus.mjs      convierte esas tablas en fichas de CPU (sin puntuar)
```

## Uso

```sh
npm install
npm run validate                    # validar data/ y scoring/
npm run fetch:wikipedia             # descargar todas las páginas a data/raw/
npm run fetch:wikipedia -- Raptor   # solo las páginas que contengan "Raptor"
npm run import:cpus                 # agregar a data/cpus/ las CPUs que aún no estén
npm run import:cpus -- --dry        # ver qué agregaría, sin escribir
```

El importador nunca modifica una ficha que ya existe (mismo `id`): lo curado a mano manda.
Qué secciones de Wikipedia se importan (y con qué plataforma, socket y año por defecto)
se define al inicio de `scripts/import-cpus.mjs`.

## Agregar o puntuar un chip

1. Agrega la ficha en `data/cpus/<marca>.json` o `data/gpus/<marca>.json`
   (el `id` empieza con la marca, p. ej. `amd-ryzen-7-7840hs`).
2. Si aún no tiene puntuación: `scores` en `null` y `score_meta.method = "pending"`.
3. Al puntuar, usa `method`:
   - `anchor`: estimado a mano a partir de reviews (citar `sources`).
   - `interpolated`: derivado de anclas de la misma familia (citar `based_on`).
4. `npm run validate` debe pasar.

## Fuentes y licencias

- Las especificaciones se toman de Wikipedia (CC BY-SA 4.0) y de las fichas oficiales
  de los fabricantes; cada ficha cita sus fuentes en `score_meta.sources`.
- Las puntuaciones son estimaciones propias: no se copian bases de datos de benchmarks.
- Código: MIT. Datos (`data/`): CC BY-SA 4.0, por derivar de Wikipedia.
