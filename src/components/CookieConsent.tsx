"use client";

import { useEffect, useRef, useState } from "react";

// Aviso de cookies (Consent Mode v2), compartido con el portafolio: la elección vive en
// localStorage["om-consent"] = "granted" | "denied" y vale para todo oswallmoena.cl.
// - El consentimiento por defecto lo fija Analytics.tsx (denegado en UE/EEE, Reino Unido y Suiza).
// - Este aviso aparece solo con zona horaria europea y sin elección previa, o al pulsar
//   cualquier elemento con data-cookie-prefs (p. ej. "Preferencias de cookies" en el pie).
const KEY = "om-consent";
type Choice = "granted" | "denied";

function readChoice(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function isEuropeTz(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    return tz.startsWith("Europe/") || /^Atlantic\/(Canary|Madeira|Azores|Reykjavik|Faroe)$/.test(tz);
  } catch {
    return false;
  }
}

// Al rechazar, borra las cookies de GA que pudieran existir de antes.
function dropGaCookies() {
  const host = location.hostname;
  for (const c of document.cookie.split(";")) {
    const name = c.split("=")[0].trim();
    if (!name.startsWith("_ga")) continue;
    for (const domain of ["", `; domain=${host}`, `; domain=.${host.replace(/^www\./, "")}`]) {
      document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
    }
  }
}

export function CookieConsent() {
  const [open, setOpen] = useState(false);
  const firstButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!readChoice() && isEuropeTz()) setOpen(true);
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest("[data-cookie-prefs]")) {
        setOpen(true);
        requestAnimationFrame(() => firstButton.current?.focus());
      }
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  const choose = (value: Choice) => {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* sin almacenamiento: se aplica solo a esta visita */
    }
    (window as unknown as { gtag?: (...a: unknown[]) => void }).gtag?.("consent", "update", { analytics_storage: value });
    if (value === "denied") dropGaCookies();
    setOpen(false);
  };

  if (!open) return null;
  return (
    <div className="cookie-consent" id="cookie-consent" role="region" aria-label="Aviso de cookies">
      <p>
        Uso cookies de Google Analytics para saber cuántas personas usan la app y qué fichas les interesan. Sin
        publicidad; puedes cambiar tu elección cuando quieras desde el pie de página.
      </p>
      <div className="cookie-consent__actions">
        <button type="button" ref={firstButton} data-consent="denied" onClick={() => choose("denied")}>
          Rechazar
        </button>
        <button type="button" data-consent="granted" onClick={() => choose("granted")}>
          Aceptar
        </button>
      </div>
    </div>
  );
}
