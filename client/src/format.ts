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
