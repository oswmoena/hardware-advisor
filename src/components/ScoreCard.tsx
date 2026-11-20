import type { ProfileResult } from "@/lib/scoring.ts";

const band = (score: number) => (score >= 6.5 ? "good" : score >= 5 ? "ok" : "poor");

export function ScoreCard({ result, note }: { result: ProfileResult; note?: string }) {
  const { score } = result;
  return (
    <article className="score-card" data-band={score === null ? undefined : band(score)}>
      <h3>{result.label}</h3>
      {score === null ? (
        <>
          <p className="score-value">
            <span className="score-number">—</span>
            <span>Pendiente</span>
          </p>
          <p className="note">Aún falta estimar: {result.missing.join(", ")}.</p>
        </>
      ) : (
        <>
          <p className="score-value">
            <span className="score-number">{score.toLocaleString("es")}</span>
            <span>
              / 10 · <strong>{result.verdict}</strong>
            </span>
          </p>
          <meter min={0} max={10} low={5} high={6.5} optimum={10} value={score} aria-label={`${result.label}: ${score} de 10`} />
        </>
      )}
      {note && <p className="note">{note}</p>}
      {result.warnings.length > 0 && (
        <ul className="warnings">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
