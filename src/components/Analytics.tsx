import Script from "next/script";
import { CookieConsent } from "@/components/CookieConsent.tsx";

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
// Consent Mode v2 (igual que el portafolio): analítica denegada por defecto en UE/EEE, Reino Unido y
// Suiza (Google decide la región por IP) y permitida en el resto; la elección guardada en
// localStorage["om-consent"] manda. Publicidad siempre denegada.
const EEA_UK_CH = ["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IE","IT","LV","LT","LU","MT","NL","PL","PT","RO","SK","SI","ES","SE","IS","LI","NO","GB","CH"];
const NO_ADS = '"ad_storage": "denied", "ad_user_data": "denied", "ad_personalization": "denied"';
const init = `
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }
window.gtag = gtag;
gtag("consent", "default", { "analytics_storage": "denied", ${NO_ADS}, "region": ${JSON.stringify(EEA_UK_CH)}, "wait_for_update": 500 });
gtag("consent", "default", { "analytics_storage": "granted", ${NO_ADS} });
try { var omc = localStorage.getItem("om-consent"); if (omc === "granted" || omc === "denied") gtag("consent", "update", { "analytics_storage": omc }); } catch (e) {}
gtag("js", new Date());
gtag("config", ${JSON.stringify(GA_ID)});
document.addEventListener("click", function (e) {
  var el = e.target instanceof Element && e.target.closest("[data-ga-event]");
  if (!el) return;
  gtag("event", el.getAttribute("data-ga-event"), { label: el.getAttribute("data-ga-label") || undefined, app: "hardware-advisor" });
});
`;

/** true si la medición está activa (para mostrar "Preferencias de cookies" en el pie). */
export const GA_ENABLED = Boolean(GA_ID);

export function Analytics() {
  if (!GA_ID) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {init}
      </Script>
      <CookieConsent />
    </>
  );
}
