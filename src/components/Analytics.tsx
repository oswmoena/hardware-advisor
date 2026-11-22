import Script from "next/script";

// Google Analytics 4, solo si NEXT_PUBLIC_GA_ID está definido en el build (variable del repo en GitHub).
// Sin la variable no se inserta nada (en local no se mide). Se valida el formato para no inyectar
// nada inesperado en la página.
const GA_ID = (process.env.NEXT_PUBLIC_GA_ID ?? "").trim();
if (GA_ID && !/^G-[A-Z0-9]{4,16}$/.test(GA_ID)) {
  throw new Error(`NEXT_PUBLIC_GA_ID no tiene formato G-XXXX: "${GA_ID}"`);
}

// Las visitas a cada página (incluida la navegación interna de Next) y las búsquedas en
// /buscar?q= las registra GA4 por su cuenta (medición mejorada). Además, cualquier elemento con
// data-ga-event="nombre" envía ese evento al hacer clic, con data-ga-label como `label`.
const init = `
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
window.gtag = gtag;
gtag("js", new Date());
gtag("config", ${JSON.stringify(GA_ID)});
document.addEventListener("click", function (e) {
  var el = e.target instanceof Element && e.target.closest("[data-ga-event]");
  if (!el) return;
  gtag("event", el.getAttribute("data-ga-event"), { label: el.getAttribute("data-ga-label") || undefined, app: "hardware-advisor" });
});
`;

export function Analytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {init}
      </Script>
    </>
  );
}
