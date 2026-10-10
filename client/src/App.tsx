import type { Summary } from "./api.ts"
import { ErrorBanner } from "./components/ErrorBanner.tsx"
import { SummaryCard } from "./components/SummaryCard.tsx"
import { formatCount, formatMicros, formatMs, formatPercent, monthName } from "./format.ts"
import { useStats } from "./useStats.ts"

export function App() {
  const { state, reload } = useStats<Summary>("/stats/summary")
  const summary = state.data
  const loading = state.status === "loading" && summary === null

  return (
    <main className="page">
      <header className="header">
        <div>
          <h1>LLM Gateway</h1>
          <p className="subtitle">{summary ? `${monthName(summary.from)}, so far (UTC)` : "This month, so far (UTC)"}</p>
        </div>
        <div className="header-actions">
          {state.status === "ready" && <span className="updated">Updated {state.loadedAt.toLocaleTimeString()}</span>}
          <button type="button" onClick={reload} disabled={state.status === "loading"}>
            {state.status === "loading" ? "Loading…" : "Refresh"}
          </button>
        </div>
      </header>

      {state.status === "error" && <ErrorBanner message={state.message} onRetry={reload} stale={summary !== null} />}

      {(loading || summary) && (
        <div className="cards">
          <SummaryCard
            label="Spend this month"
            loading={loading}
            value={summary ? formatMicros(summary.spendMicros) : null}
            detail={summary ? formatCount(summary.requests, "request", "requests") : ""}
          />
          <SummaryCard
            label="Cache hit rate"
            loading={loading}
            value={summary?.hitRate == null ? null : formatPercent(summary.hitRate)}
            detail={summary ? (summary.lookups === 0 ? "No cache lookups yet" : `${summary.hits} of ${formatCount(summary.lookups, "lookup", "lookups")}`) : ""}
          />
          <SummaryCard
            label="Estimated savings"
            loading={loading}
            value={summary ? formatMicros(summary.savedMicros) : null}
            detail="What the cached answers would have cost"
          />
          <SummaryCard
            label="Median time to first token"
            loading={loading}
            value={summary?.ttftP50 == null ? null : formatMs(summary.ttftP50)}
            detail={summary ? (summary.ttftSamples === 0 ? "No streamed answers yet" : `Across ${formatCount(summary.ttftSamples, "streamed answer", "streamed answers")}`) : ""}
          />
        </div>
      )}
    </main>
  )
}
