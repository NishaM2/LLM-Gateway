import { useEffect, useRef } from "react"
import type { RequestRow } from "../../api.ts"
import { cacheLabel, formatMicros, formatMs, STATUS_LABELS } from "../../format.ts"

type Props = {
  request: RequestRow
  onClose: () => void
}

export function RequestDetail({ request, onClose }: Props) {
  const closeButton = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeButton.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [request.id, onClose])

  const cached = request.cacheStatus === "hit" || request.cacheStatus === "semantic_hit"

  const rows: [string, string][] = [
    ["When", new Date(request.createdAt).toLocaleString()],
    ["Tenant", request.tenant ?? "None (no valid API key)"],
    ["Model requested", request.modelRequested ?? "—"],
    ["Model served", request.modelServed ?? "—"],
    ["Provider", request.provider ?? "—"],
    ["Outcome", STATUS_LABELS[request.status] ?? request.status],
    ["Error code", request.errorCode ?? "—"],
    ["Attempts", request.attempts === null ? "—" : cached && request.attempts === 0 ? "0 (no provider call)" : String(request.attempts)],
    ["Cache", cacheLabel(request.cacheStatus)],
    ["Similarity score", similarityText(request)],
    ["Input tokens", request.inputTokens?.toLocaleString() ?? "—"],
    ["Output tokens", request.outputTokens?.toLocaleString() ?? "—"],
    ["Cost", request.costMicros === null ? "—" : `${formatMicros(request.costMicros)}${cached ? " (served from cache)" : ""}`],
    ["Total time", request.latencyMs === null ? "—" : formatMs(request.latencyMs)],
    ["Time to first token", request.ttftMs === null ? "Not streamed" : formatMs(request.ttftMs)],
  ]

  return (
    <aside className="detail" aria-label="Request details">
      <div className="detail-header">
        <h3>Request details</h3>
        <button ref={closeButton} type="button" className="button-quiet" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="detail-id">{request.id}</p>
      <dl className="detail-list">
        {rows.map(([label, value]) => (
          <div key={label} className="detail-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  )
}

function similarityText(request: RequestRow): string {
  const score = request.semanticSimilarity
  if (score === null) return request.cacheStatus === "miss" ? "No stored question to compare with" : "—"
  if (request.cacheStatus === "semantic_hit") return `${score.toFixed(3)}, matched a stored question`
  return `${score.toFixed(3)}, closest stored question, not used`
}
