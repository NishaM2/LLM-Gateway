import { Link } from "react-router"
import { GITHUB_URL } from "../../site.ts"
import { CodeSample } from "./CodeSample.tsx"

export function Hero() {
  return (
    <header className="hero">
      <div>
        <span className="eyebrow">
          <span className="dot" />
          OpenAI-compatible, self-hosted
        </span>
        <h1>
          One endpoint for every model. <span className="soft">Faster, cheaper, harder to break.</span>
        </h1>
        <p className="lead">
          A gateway that sits between your app and its LLM providers. It answers repeated and reworded questions from cache, falls back when a
          provider fails, enforces per-tenant budgets and records the cost of every token.
        </p>
        <div className="cta">
          <Link className="button button-primary" to="/dashboard">
            Explore Dashboard
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
          <a className="button button-secondary" href={GITHUB_URL}>
            View the code
          </a>
        </div>
      </div>
      <CodeSample />
    </header>
  )
}
