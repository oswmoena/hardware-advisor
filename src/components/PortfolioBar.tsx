import { PORTFOLIO_URL, REPO_URL, SITE_NAME } from "@/lib/present.ts";

// Barra del portafolio de Oswall Moena, visible cuando la app se publica dentro de él
// (NEXT_PUBLIC_PORTFOLIO_URL definido). Enlaces normales: no necesita JavaScript.
export function PortfolioBar() {
  if (!PORTFOLIO_URL) return null;
  return (
    <nav className="portfolio-bar" aria-label="Portafolio de Oswall Moena">
      <div className="portfolio-bar__inner">
        <div className="portfolio-bar__group">
          <a href={PORTFOLIO_URL} className="portfolio-bar__back" data-ga-event="portfolio_nav" data-ga-label="back">
            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            <span className="portfolio-bar__logo" aria-hidden="true">
              OM
            </span>
            Portafolio de Oswall
          </a>
          <span className="portfolio-bar__divider" aria-hidden="true" />
          <span className="portfolio-bar__app">{SITE_NAME}</span>
        </div>
        <div className="portfolio-bar__group">
          <a href={`${PORTFOLIO_URL}/#apps`} className="portfolio-bar__link" data-ga-event="portfolio_nav" data-ga-label="other_apps">
            Otras apps
          </a>
          <a href={REPO_URL} className="portfolio-bar__link" data-ga-event="view_code" data-ga-label="hardware-advisor">
            Ver código
          </a>
        </div>
      </div>
    </nav>
  );
}
