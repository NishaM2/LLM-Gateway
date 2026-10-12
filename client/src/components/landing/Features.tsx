import type { ReactNode } from "react"

type Feature = { title: string; text: string; icon: ReactNode }

const FEATURES: Feature[] = [
  {
    title: "Drop-in compatible",
    text: "Speaks the OpenAI chat API, streaming included. Gemini is translated behind the same contract.",
    icon: <><path d="M4 7h16M4 12h10M4 17h7" /><path d="m16 15 3 3-3 3" /></>,
  },
  {
    title: "Cached streams that still stream",
    text: "A cached answer is replayed in small paced chunks, so a chat UI keeps typing instead of flashing a wall of text.",
    icon: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  },
  {
    title: "Namespaced semantic cache",
    text: "Tenant, model, system prompt, tools, temperature and conversation so far must all match before meaning is compared.",
    icon: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><circle cx="12" cy="12" r="3" /></>,
  },
  {
    title: "Retries and fallback",
    text: "Doubling, jittered retries for failures that might pass, and a switch to the next provider for logical model names.",
    icon: <path d="M4 12h5l2-5 2 10 2-5h5" />,
  },
  {
    title: "Circuit breaker",
    text: "Five failures in a minute and a provider is skipped for thirty seconds, then tested with a single request.",
    icon: <><rect x="4" y="9" width="16" height="11" rx="2" /><path d="M8 9V7a4 4 0 0 1 8 0v2" /></>,
  },
  {
    title: "Cost to the micro-dollar",
    text: "Every row is priced from a price table with effective dates, including Gemini's hidden reasoning tokens.",
    icon: <><path d="M12 3v18" /><path d="M16 7.5c0-1.4-1.8-2.5-4-2.5s-4 1.1-4 2.5S9.8 10 12 10s4 1.1 4 2.5S14.2 15 12 15s-4-1.1-4-2.5" /></>,
  },
  {
    title: "Tenants, keys and budgets",
    text: "Keys are shown once and stored as hashes. Monthly budgets stop a runaway client before it spends more.",
    icon: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 4h5M16 8h5M18 12h3" /></>,
  },
  {
    title: "Dashboard",
    text: "Spend, hit rate, savings and latency charts, plus a request log filtered and paged on the server.",
    icon: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  },
  {
    title: "Mock provider",
    text: "Fails on demand with 429s, 500s, slow starts or broken streams, so resilience is tested without burning real quota.",
    icon: <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3" />,
  },
]

const STACK = ["TypeScript", "Node 22", "Express 5", "Postgres + pgvector", "Drizzle ORM", "Redis", "Zod", "transformers.js", "React + Recharts"]

export function Features() {
  return (
    <section id="features" className="landing-section">
      <div className="section-head">
        <p className="kicker">What's inside</p>
        <h2>Everything a production gateway needs, and nothing it doesn't.</h2>
      </div>

      <div className="features">
        {FEATURES.map((feature) => (
          <div key={feature.title} className="feature">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {feature.icon}
            </svg>
            <h3>{feature.title}</h3>
            <p>{feature.text}</p>
          </div>
        ))}
      </div>

      <div className="stack" aria-label="Built with">
        {STACK.map((item) => (
          <span key={item} className="chip">
            {item}
          </span>
        ))}
      </div>
    </section>
  )
}
