import { useEffect, useState } from "react"
import type { HitRateResponse, LatencyResponse, SpendResponse, Summary } from "../api.ts"
import { ChartCard } from "../components/dashboard/ChartCard.tsx"
import { ErrorBanner } from "../components/dashboard/ErrorBanner.tsx"
import { HitRateChart } from "../components/dashboard/HitRateChart.tsx"
import { LatencyChart } from "../components/dashboard/LatencyChart.tsx"
import { RequestLog } from "../components/dashboard/RequestLog.tsx"
import { SpendChart } from "../components/dashboard/SpendChart.tsx"
import { SummaryCard } from "../components/dashboard/SummaryCard.tsx"
import { formatCount, formatMicros, formatMs, formatPercent, monthName } from "../format.ts"
import { useStats } from "../useStats.ts"
import { SiteFooter } from "../components/layout/SiteFooter.tsx"
import { SiteHeader } from "../components/layout/SiteHeader.tsx"

const CHART_DAYS = 30

export function DashboardPage() {
  const [refreshKey, setRefreshKey] = useState(0)
  const refresh = () => setRefreshKey((key) => key + 1)

  const { state } = useStats<Summary>("/stats/summary", refreshKey)
  const latency = useStats<LatencyResponse>(`/stats/latency?days=${CHART_DAYS}`, refreshKey).state
  const spend = useStats<SpendResponse>(`/stats/spend?days=${CHART_DAYS}`, refreshKey).state
  const hitRate = useStats<HitRateResponse>(`/stats/hit-rate?days=${CHART_DAYS}`, refreshKey).state

  useEffect(() => {
    document.title = "Dashboard · LLM Gateway"
  }, [])

  const summary = state.data
  const loading = state.status === "loading" && summary === null
  const showContent = loading || summary !== null

  return (
    <div className="dashboard">
      <SiteHeader page="dashboard" />
      <main className="page">
        <header className="header">
          <div>
            <h1>Dashboard</h1>
            <p className="subtitle">{summary ? `${monthName(summary.from)}, so far (UTC)` : "This month, so far (UTC)"}</p>
          </div>
          <div className="header-actions">
            {state.status === "ready" && <span className="updated">Updated {state.loadedAt.toLocaleTimeString()}</span>}
            <button type="button" onClick={refresh} disabled={state.status === "loading"}>
              {state.status === "loading" ? "Loading…" : "Refresh"}
            </button>
          </div>
        </header>

        {state.status === "error" && <ErrorBanner message={state.message} onRetry={refresh} stale={summary !== null} />}

        {showContent && (
          <>
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

            <div className="charts">
              <ChartCard
                wide
                title="Response time: cached vs uncached"
                description={`Successful requests over the last ${CHART_DAYS} days, by what the cache did`}
                state={latency}
                isEmpty={(data) => data.groups.length === 0}
                emptyMessage="No successful requests yet."
              >
                {(data) => <LatencyChart groups={data.groups} />}
              </ChartCard>
              <ChartCard
                title="Spend per day"
                description={`Last ${CHART_DAYS} days, UTC`}
                state={spend}
                isEmpty={(data) => data.spend.every((day) => day.requests === 0)}
                emptyMessage="No requests in this period."
              >
                {(data) => <SpendChart spend={data.spend} />}
              </ChartCard>
              <ChartCard
                title="Cache hit rate per day"
                description="Share of cache lookups answered without calling a provider"
                state={hitRate}
                isEmpty={(data) => data.daily.length === 0}
                emptyMessage="No cache lookups in this period."
              >
                {(data) => <HitRateChart daily={data.daily} days={CHART_DAYS} />}
              </ChartCard>
            </div>

            <RequestLog refreshKey={refreshKey} />
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}
