import Link from "next/link";

export interface Crumb {
  name: string;
  href: string;
}

// Une la URL del sitio (que puede incluir una ruta base) con una ruta interna. `new URL("/x", base)`
// descartaría la ruta base, por eso se concatena.
const absoluteUrl = (siteUrl: string, href: string) => `${siteUrl.replace(/\/$/, "")}${href === "/" ? "/" : href}`;

// Migas de pan visibles + datos estructurados BreadcrumbList para buscadores.
export function Breadcrumbs({ items, siteUrl }: { items: Crumb[]; siteUrl: string }) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absoluteUrl(siteUrl, c.href) })),
  };
  return (
    <nav aria-label="Ruta de navegación" className="breadcrumbs">
      <ol>
        {items.map((c, i) => (
          <li key={c.href}>{i === items.length - 1 ? <span aria-current="page">{c.name}</span> : <Link href={c.href}>{c.name}</Link>}</li>
        ))}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </nav>
  );
}
