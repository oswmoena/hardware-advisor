import type { MetadataRoute } from "next";
import { getCpus, getGpus } from "@/lib/data.ts";
import { SITE_URL } from "@/lib/present.ts";

// Se genera en el build: el sitio se publica como archivos estáticos.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    ...getCpus().map((c) => ({ url: `${SITE_URL}/cpu/${c.id}`, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...getGpus().map((g) => ({ url: `${SITE_URL}/gpu/${g.id}`, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
