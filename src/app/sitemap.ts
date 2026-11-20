import type { MetadataRoute } from "next";
import { getCpus, getGpus } from "@/lib/data.ts";
import { SITE_URL } from "@/lib/present.ts";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: "weekly", priority: 1 },
    ...getCpus().map((c) => ({ url: `${SITE_URL}/cpu/${c.id}`, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...getGpus().map((g) => ({ url: `${SITE_URL}/gpu/${g.id}`, changeFrequency: "monthly" as const, priority: 0.7 })),
  ];
}
