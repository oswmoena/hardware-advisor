import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SITE_NAME, SITE_URL } from "@/lib/present.ts";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE_NAME}: ¿qué tal es este procesador o tarjeta gráfica?`, template: `%s | ${SITE_NAME}` },
  description:
    "Consulta qué tal es un procesador o tarjeta gráfica de laptop o escritorio: nota para jugar, programar y ofimática, advertencias y para qué es recomendable.",
  openGraph: { siteName: SITE_NAME, locale: "es_ES", type: "website" },
};

// Declara soporte de modo claro y oscuro antes del primer pintado (evita el destello).
export const viewport: Viewport = { colorScheme: "light dark" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="brand">
              {SITE_NAME}
            </Link>
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <p>
              Las notas son estimaciones propias. En los índices, 100 = el mejor procesador o tarjeta gráfica actual.
            </p>
          </div>
        </footer>
      </body>
    </html>
  );
}
