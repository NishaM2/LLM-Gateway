const LATENCY = [
  { label: "Exact hit", ms: 56, cached: true },
  { label: "Semantic hit", ms: 141, cached: true },
  { label: "Miss", ms: 718, cached: false },
  { label: "Cache skipped", ms: 606, cached: false },
]

const SLOWEST = Math.max(...LATENCY.map((row) => row.ms))

const TRAPS = [
  { score: "0.992", pair: "convert a string to a number / a number to a string", why: "Stopped: direction swapped" },
  { score: "0.984", pair: "is it legal / illegal to record a call", why: "Stopped: opposite meaning" },
  { score: "0.969", pair: "schedule it for next week / this week", why: "Stopped: dates differ" },
]

export function Results() {
  return (
    <section id="results" className="landing-section">
      <div className="section-head">
        <p className="kicker">Measured, not guessed</p>
        <h2>The cache pays for itself, and the guards keep it honest.</h2>
        <p>
          Numbers from 50 requests against Groq's free tier, and from a threshold sweep over 200 question pairs labelled by hand, nearly half of
          them written to trip the embedding model up.
        </p>
      </div>

      <div className="compare">
        <div className="panel">
          <h3>Median response time</h3>
          <p className="sub">Successful requests, by what the cache did</p>
          {LATENCY.map((row) => (
            <div key={row.label} className="bar-row">
              <span className="bar-label">{row.label}</span>
              <span className="bar-track">
                <span className={row.cached ? "bar-fill" : "bar-fill slow"} style={{ width: `${(row.ms / SLOWEST) * 100}%` }} />
              </span>
              <span className="bar-value">{row.ms} ms</span>
            </div>
          ))}
          <p className="sub panel-note">A cached answer costs nothing. The tokens it would have used are still recorded, so the dashboard can show what the cache saved.</p>
        </div>

        <div className="panel">
          <h3>Semantic matches at a 0.90 threshold</h3>
          <p className="sub">Out of 115 pairs that mean different things</p>
          <div className="before-after">
            <div className="ba">
              <div className="ba-label">Embeddings alone</div>
              <div className="ba-value">
                30 <small>wrong</small>
              </div>
            </div>
            <div className="ba after">
              <div className="ba-label">With guards</div>
              <div className="ba-value">
                3 <small>wrong</small>
              </div>
            </div>
          </div>
          <ul className="traps">
            {TRAPS.map((trap) => (
              <li key={trap.score}>
                <span className="score">{trap.score}</span>
                <span>
                  {trap.pair}
                  <span className="why">{trap.why}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
