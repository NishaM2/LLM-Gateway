import { Link } from "react-router"
import { GITHUB_URL } from "../../site.ts"
import { ThemeToggle } from "./ThemeToggle.tsx"

type Props = { page: "landing" | "dashboard" }

export function SiteHeader({ page }: Props) {
  return (
    <nav className="site-nav">
      <div className="wrap nav-inner">
        <Link className="brand" to="/">
          <img src="/favicon.svg" alt="" />
          LLM Gateway
        </Link>
        <div className="nav-links">
          {page === "landing" && (
            <>
              <a className="optional" href="#how">How it works</a>
              <a className="optional" href="#results">Results</a>
              <a className="optional" href="#features">Features</a>
            </>
          )}
          {page === "dashboard" && (
            <Link className="optional" to="/">
              ← Back to home
            </Link>
          )}
          <a className="optional" href={GITHUB_URL}>
            GitHub
          </a>
          {page === "landing" && (
            <Link className="button button-primary button-small" to="/dashboard">
              Explore Dashboard
            </Link>
          )}
          <ThemeToggle />
        </div>
      </div>
    </nav>
  )
}
