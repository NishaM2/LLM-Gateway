export function formatMicros(micros: number): string {
  const dollars = micros / 1_000_000
  if (dollars === 0) return "$0.00"
  if (dollars < 0.01) return `$${dollars.toFixed(6)}`
  return `$${dollars.toFixed(2)}`
}

export function formatPercent(share: number): string {
  return `${Math.round(share * 100)}%`
}

export function formatMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${ms} ms`
}

export function formatCount(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}

export function monthName(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })
}

export function formatDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" })
}

export function lastDays(count: number): string[] {
  const today = new Date()
  const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  return Array.from({ length: count }, (_, index) => new Date(start - (count - 1 - index) * 86_400_000).toISOString().slice(0, 10))
}

export const CACHE_LABELS: Record<string, string> = {
  hit: "Exact hit",
  semantic_hit: "Semantic hit",
  miss: "Miss",
  skip: "Skipped",
}

export const STATUS_LABELS: Record<string, string> = {
  ok: "OK",
  fallback: "OK via fallback",
  error: "Error",
}

export function cacheLabel(status: string | null): string {
  return status === null ? "Not reached" : (CACHE_LABELS[status] ?? status)
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })
}
