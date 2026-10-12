const STEPS = [
  {
    title: "Key and budget",
    text: "Hashed API keys identify the tenant. Over this month's budget means a 402 before anything is spent.",
    exit: "Stops bad or broke callers",
    stops: true,
  },
  {
    title: "Exact cache",
    text: "The request is rewritten into one canonical form and hashed. Redis answers identical requests in milliseconds.",
    exit: "Answers repeats",
    stops: false,
  },
  {
    title: "Semantic cache",
    text: "The question becomes 384 numbers. pgvector finds the closest one already answered, in the same namespace only.",
    exit: "Answers rewordings",
    stops: false,
  },
  {
    title: "Guards",
    text: "Numbers, dates, names, negations and word order must match before a similar answer is trusted.",
    exit: "Stops near misses",
    stops: true,
  },
  {
    title: "Router",
    text: "Retries with backoff, falls back to the next provider, and skips one that is down using a circuit breaker.",
    exit: "Calls Groq or Gemini",
    stops: false,
  },
]

export function RequestFlow() {
  return (
    <section id="how" className="landing-section">
      <div className="section-head">
        <p className="kicker">How a request flows</p>
        <h2>Five checks, cheapest first.</h2>
        <p>
          Every request goes through the same pipeline. Each stage either answers straight away or hands on to the next, so the expensive
          provider call only happens when nothing cheaper can answer.
        </p>
      </div>

      <ol className="flow">
        {STEPS.map((step) => (
          <li key={step.title} className="step">
            <h3>{step.title}</h3>
            <p>{step.text}</p>
            <span className={step.stops ? "exit stop" : "exit"}>{step.exit}</span>
          </li>
        ))}
      </ol>
      <p className="flow-note">Every request, whichever stage answered it, is logged with tokens, cost in micro-dollars, latency and time to first token.</p>
    </section>
  )
}
