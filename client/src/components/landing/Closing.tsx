import { Link } from "react-router"
import { GITHUB_URL, RESULTS_URL } from "../../site.ts"

export function Closing() {
  return (
    <div className="closing">
      <div>
        <h2>See it running, then read how it works.</h2>
        <p>The dashboard shows live traffic from the demo. The README documents every behaviour, and the evals folder has the full threshold study.</p>
      </div>
      <div className="cta">
        <Link className="button button-primary" to="/dashboard">
          Explore Dashboard
        </Link>
        <a className="button button-secondary" href={GITHUB_URL}>
          Open on GitHub
        </a>
        <a className="button button-secondary" href={RESULTS_URL}>
          Threshold study
        </a>
      </div>
    </div>
  )
}
