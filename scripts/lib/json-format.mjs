// Serializa JSON de forma legible y estable para diffs: los objetos y arreglos
// pequeños quedan en una línea; los grandes se expanden.
const MAX_WIDTH = 100;

function inline(value) {
  if (Array.isArray(value)) return value.length ? `[${value.map(inline).join(", ")}]` : "[]";
  if (value && typeof value === "object") {
    const parts = Object.entries(value).map(([k, v]) => `${JSON.stringify(k)}: ${inline(v)}`);
    return parts.length ? `{ ${parts.join(", ")} }` : "{}";
  }
  return JSON.stringify(value);
}

function format(value, indent, prefixLength) {
  const flat = inline(value);
  if (indent.length + prefixLength + flat.length <= MAX_WIDTH || value === null || typeof value !== "object") return flat;
  const inner = indent + "  ";
  if (Array.isArray(value)) {
    return `[\n${value.map((v) => inner + format(v, inner, 0)).join(",\n")}\n${indent}]`;
  }
  const lines = Object.entries(value).map(([k, v]) => {
    const key = `${JSON.stringify(k)}: `;
    return inner + key + format(v, inner, key.length);
  });
  return `{\n${lines.join(",\n")}\n${indent}}`;
}

export const formatJson = (value) => format(value, "", 0) + "\n";
