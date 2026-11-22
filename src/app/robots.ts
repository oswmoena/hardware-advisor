import type { MetadataRoute } from "next";
import { BASE_PATH, SITE_URL } from "@/lib/present.ts";

// Se genera en el build: el sitio se publica como archivos estáticos.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: `${BASE_PATH}/buscar` },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
