// Genera src/lib/data-types.ts a partir de los JSON Schema de data/schema,
// para que el front y los datos no puedan desalinearse. Correr tras cambiar un schema.
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileFromFile } from "json-schema-to-typescript";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const schemaDir = join(root, "data", "schema");
const options = { cwd: schemaDir, bannerComment: "", additionalProperties: false, style: { singleQuote: false } };

const parts = [];
for (const name of ["cpu", "gpu"]) {
  parts.push(await compileFromFile(join(schemaDir, `${name}.schema.json`), options));
}
// Ambos schemas referencian common.schema.json: deduplicar declaraciones repetidas.
const seen = new Set();
const body = parts
  .join("\n")
  .split(/\n(?=\/\*\*|export )/)
  .filter((block) => {
    const name = block.match(/export (?:interface|type) (\w+)/)?.[1];
    if (!name) return true;
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  })
  .join("\n")
  .replace(/\/\*\*(?:(?!\*\/)[\s\S])*\*\/\n(?=\/\*\*)/g, ""); // comentario huérfano de un tipo deduplicado

const banner = "// Generado por scripts/gen-types.mjs desde data/schema. No editar a mano.\n\n";
await writeFile(join(root, "src", "lib", "data-types.ts"), banner + body.trim() + "\n");
console.log("✔ src/lib/data-types.ts generado:", [...seen].join(", "));
