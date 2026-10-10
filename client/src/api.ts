export const REQUEST_TIMEOUT_MS = 8_000

export type Summary = {
  from: string
  spendMicros: number
  requests: number
  hitRate: number | null
  hits: number
  lookups: number
  savedMicros: number
  ttftP50: number | null
  ttftSamples: number
}

export class ApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ApiError"
  }
}

export async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  let response: Response

  try {
    response = await fetch(path, { signal: AbortSignal.any([signal, timeout]) })
  } catch (error) {
    if (signal.aborted) throw error
    if (timeout.aborted) throw new ApiError(`The gateway took longer than ${REQUEST_TIMEOUT_MS / 1000} seconds to answer.`)
    throw new ApiError("Can't reach the dashboard server. Is npm run dashboard still running?")
  }

  const body = await response.json().catch(() => null)
  if (response.ok && body !== null) return body as T

  throw new ApiError(describeFailure(response.status, body))
}

function describeFailure(status: number, body: any): string {
  const type = body?.error?.type
  if (type === "gateway_unreachable") return "Can't reach the gateway. Start it with npm run dev, then try again."
  if (type === "stats_disabled") return "Stats are turned off on the gateway. Set ADMIN_TOKEN in .env and restart it."
  if (status === 401) return "The gateway refused the admin token. Check ADMIN_TOKEN in .env and restart the dashboard."
  if (status >= 500) return "The gateway hit a problem while reading the stats. Check its console for details."
  return `Unexpected answer from the gateway (HTTP ${status}).`
}
