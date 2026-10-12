import { useCallback, useState } from "react"
import type { RequestPage, TenantsResponse } from "../../api.ts"
import { CACHE_LABELS, cacheLabel, formatMicros, formatMs, formatTime, STATUS_LABELS } from "../../format.ts"
import { useStats } from "../../useStats.ts"
import { RequestDetail } from "./RequestDetail.tsx"

const PAGE_SIZE = 25

type Filters = { tenant: string; cacheStatus: string; status: string }

const NO_FILTERS: Filters = { tenant: "", cacheStatus: "", status: "" }

export function RequestLog({ refreshKey }: { refreshKey: number }) {
  const [filters, setFilters] = useState<Filters>(NO_FILTERS)
  const [cursors, setCursors] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const tenants = useStats<TenantsResponse>("/stats/tenants", refreshKey).state

  const params = new URLSearchParams({ limit: String(PAGE_SIZE) })
  if (filters.tenant) params.set("tenant", filters.tenant)
  if (filters.cacheStatus) params.set("cacheStatus", filters.cacheStatus)
  if (filters.status) params.set("status", filters.status)
  const cursor = cursors.at(-1)
  if (cursor) params.set("cursor", cursor)

  const { state } = useStats<RequestPage>(`/stats/requests?${params}`, refreshKey)
  const page = state.data
  const selected = page?.requests.find((request) => request.id === selectedId) ?? null
  const closeDetail = useCallback(() => setSelectedId(null), [])

  function changeFilter(name: keyof Filters, value: string): void {
    setFilters((current) => ({ ...current, [name]: value }))
    setCursors([])
    setSelectedId(null)
  }

  const filtered = filters.tenant !== "" || filters.cacheStatus !== "" || filters.status !== ""

  return (
    <section className="log-card" aria-busy={state.status === "loading"}>
      <div className="log-heading">
        <div>
          <h2 className="chart-title">Request log</h2>
          <p className="chart-description">Newest first. Filtering and paging happen on the server, so this stays fast however big the log gets.</p>
        </div>
      </div>

      <div className="filters">
        <label>
          Tenant
          <select value={filters.tenant} onChange={(event) => changeFilter("tenant", event.target.value)}>
            <option value="">All tenants</option>
            {tenants.data?.tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name} ({tenant.requests})
              </option>
            ))}
          </select>
        </label>
        <label>
          Cache
          <select value={filters.cacheStatus} onChange={(event) => changeFilter("cacheStatus", event.target.value)}>
            <option value="">Any</option>
            {Object.entries(CACHE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Outcome
          <select value={filters.status} onChange={(event) => changeFilter("status", event.target.value)}>
            <option value="">Any</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {filtered && (
          <button type="button" className="button-quiet" onClick={() => { setFilters(NO_FILTERS); setCursors([]); setSelectedId(null) }}>
            Clear filters
          </button>
        )}
      </div>

      <div className={selected ? "log-layout log-layout-open" : "log-layout"}>
        <div className="table-wrap">
          {state.status === "error" && <p className="chart-message">Couldn't load requests. {state.message}</p>}
          {page === null && state.status === "loading" && <div className="skeleton chart-skeleton" />}
          {page !== null && page.requests.length === 0 && <p className="chart-message">No requests match these filters.</p>}
          {page !== null && page.requests.length > 0 && (
            <table className="log-table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Tenant</th>
                  <th scope="col">Model</th>
                  <th scope="col">Outcome</th>
                  <th scope="col">Cache</th>
                  <th scope="col" className="numeric">Time taken</th>
                  <th scope="col" className="numeric">Cost</th>
                </tr>
              </thead>
              <tbody>
                {page.requests.map((request) => (
                  <tr
                    key={request.id}
                    tabIndex={0}
                    aria-selected={request.id === selectedId}
                    className={request.id === selectedId ? "selected" : undefined}
                    onClick={() => setSelectedId(request.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        setSelectedId(request.id)
                      }
                    }}
                  >
                    <td>{formatTime(request.createdAt)}</td>
                    <td>{request.tenant ?? "—"}</td>
                    <td>{request.modelRequested ?? "—"}</td>
                    <td>
                      <span className={`outcome outcome-${request.status}`}>{STATUS_LABELS[request.status] ?? request.status}</span>
                    </td>
                    <td>
                      {cacheLabel(request.cacheStatus)}
                      {request.cacheStatus === "semantic_hit" && request.semanticSimilarity !== null && (
                        <span className="muted"> {request.semanticSimilarity.toFixed(3)}</span>
                      )}
                    </td>
                    <td className="numeric">{request.latencyMs === null ? "—" : formatMs(request.latencyMs)}</td>
                    <td className="numeric">{request.costMicros === null ? "—" : formatMicros(request.costMicros)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {selected && <RequestDetail request={selected} onClose={closeDetail} />}
      </div>

      <div className="pager">
        <button type="button" className="button-quiet" disabled={cursors.length === 0 || state.status === "loading"} onClick={() => { setCursors((stack) => stack.slice(0, -1)); setSelectedId(null) }}>
          ← Newer
        </button>
        <span className="muted">Page {cursors.length + 1}</span>
        <button
          type="button"
          className="button-quiet"
          disabled={!page?.nextCursor || state.status === "loading"}
          onClick={() => {
            const next = page?.nextCursor
            if (next) setCursors((stack) => [...stack, next])
            setSelectedId(null)
          }}
        >
          Older →
        </button>
      </div>
    </section>
  )
}
