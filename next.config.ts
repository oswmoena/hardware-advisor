import type { NextConfig } from "next";

// Ruta bajo la que se publica la app, p. ej. "/apps/hardware-advisor". Vacía = raíz del dominio.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Sitio estático en out/: lo sirve nginx (o cualquier servidor de archivos) sin proceso Node.
  output: "export",
  basePath,
};

export default nextConfig;
