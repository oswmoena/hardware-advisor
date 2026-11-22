# hardware-advisor

Consulta de rendimiento de CPUs y GPUs (laptops y desktops) con una nota por uso
(juegos, programación, multitarea, ofimática), advertencias concretas y un "recomendable para…".
Más adelante: comparación lado a lado y guía para armar PC.

## Cómo se puntúa

Hay dos escalas:

**1. Índice interno (lo que se guarda en `data/`)**, relativo a una referencia de
calibración fija = 100:

| Categoría | Referencia interna | Índices |
|---|---|---|
| CPU | AMD Ryzen 5 7600 (desktop) | `single`, `multi` |
| GPU | NVIDIA GeForce RTX 4060 (desktop) | `gaming`, `compute` |

Esta escala no cambia con los lanzamientos: sobre ella se calibran las notas y el
emparejamiento CPU ↔ GPU.

**2. Índice visible (lo que muestra el sitio)**: 100 = el mejor chip actual de la base en
cada métrica (`src/lib/scale.ts`). Se calcula en cada build, así que cuando entra una
generación más potente pasa a ser el 100 y el resto baja proporcionalmente (lo que hoy
es 100 puede pasar a 95). Los topes actuales: Ryzen 7 9850X3D para juegos y RTX 5090
entre las GPUs (las de laptop se miden contra la mejor de escritorio).

Las **notas de 0 a 10** son absolutas: no bajan con los lanzamientos nuevos.

Las GPUs de laptop guardan la puntuación con la potencia (TGP) mínima y máxima,
porque una misma GPU rinde muy distinto según cómo la configure el fabricante.

Las notas de 0 a 10 por uso **no se guardan**: se calculan con `scoring/profiles.json`
(curvas índice → nota, pesos por uso y reglas que limitan la nota y agregan advertencias).

## Sitio web (Next.js)

```sh
npm install
npm run dev          # http://localhost:3000
npm run build        # exporta el sitio estático completo a out/
npm run build:portfolio  # igual, pero para publicarlo en oswallmoena.cl/apps/hardware-advisor
npm test             # tests del motor de puntuación y la búsqueda
```

El sitio es 100 % estático (`output: "export"`): `out/` se puede servir con nginx o cualquier
servidor de archivos, sin proceso Node. Variables de build:

| Variable | Para qué |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | URL pública completa, incluida la ruta base (p. ej. `https://oswallmoena.cl/apps/hardware-advisor`). Se usa en canónicas, sitemap y datos estructurados. |
| `NEXT_PUBLIC_BASE_PATH` | Ruta bajo la que se publica (p. ej. `/apps/hardware-advisor`). Vacía = raíz del dominio. |
| `NEXT_PUBLIC_PORTFOLIO_URL` | Si se define, muestra la barra del portafolio (volver, otras apps, ver código). |
| `NEXT_PUBLIC_GA_ID` | ID de Google Analytics 4 (`G-XXXX`). En CI viene de la variable del repo `PUBLIC_GA_ID`; sin ella no se mide. | Con Consent Mode v2: analítica denegada por defecto en UE/EEE, Reino Unido y Suiza; aviso para zona horaria europea; elección compartida con el portafolio en `localStorage["om-consent"]`. |

### Publicar en el portafolio (nginx)

Cada push a `main` se publica solo con GitHub Actions (`.github/workflows/ci-cd.yml`): tests,
build y `rsync` al servidor. En los PR solo corren los tests y el build. Para publicar a mano:

```sh
npm run build:portfolio
rsync -az --delete out/ usuario@servidor:/var/www/apps/hardware-advisor/
```

```nginx
# Dentro del server {} de oswallmoena.cl. Los archivos viven en /var/www/apps/hardware-advisor/.
# Sin barra final, la ruta caería en `location /` (el portafolio). Next también la pide al navegar.
location = /apps/hardware-advisor {
    return 301 /apps/hardware-advisor/;
}
location /apps/hardware-advisor/ {
    root /var/www;
    try_files $uri $uri.html $uri/index.html =404;
    error_page 404 /apps/hardware-advisor/404.html;
}
location /apps/hardware-advisor/_next/static/ {
    root /var/www;
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

Cada página pesa unos 140 KB de HTML (unos 16 KB con gzip), porque las fichas de CPU incluyen
la lista de GPUs para armar combinaciones; conviene tener `gzip on;` en nginx.

| Ruta | Qué es |
|---|---|
| `/` | búsqueda en vivo de CPUs y GPUs |
| `/cpu/[id]`, `/gpu/[id]` | ficha estática e indexable de cada chip; las CPUs de escritorio incluyen las GPUs recomendadas con un equipo de ejemplo editable |
| `/buscar?q=` | destino del formulario de búsqueda; lee `?q=` en el navegador (no indexada) |
| `/sitemap.xml`, `/robots.txt` | SEO |

El código de la app está en `src/`: `src/lib/scoring.ts` (motor de puntuación, lógica pura),
`src/lib/data.ts` (lectura de `data/` en build) y `src/lib/data-types.ts`, generado desde los
JSON Schema con `npm run types:gen`.

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
npm run import:gpus                 # ídem para GPUs dedicadas (desktop y laptop)
npm run estimate                    # completar índices provisionales (method "estimated")
```

### Índices provisionales

`npm run estimate` calcula un índice aproximado para cada chip sin puntuar, a partir de sus
especificaciones (`scripts/lib/estimate.mjs`):

- **CPU**: single-core = frecuencia turbo × IPC de la arquitectura; multi-core suma núcleos
  P y E con la frecuencia sostenida según el consumo y un bono por SMT.
- **GPU**: (TFLOPS FP32 × factor de arquitectura)^0,7; en laptops, el índice a potencia
  mínima escala con (TGP mín / TGP máx)^0,55.

Se muestran en el sitio como "estimación automática". El script recalcula las fichas
`estimated` y nunca toca las `reference`, `anchor` ni `interpolated`.

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
