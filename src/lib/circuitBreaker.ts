export const FAILURE_THRESHOLD = 5
// Must be comfortably longer than the time it takes for FAILURE_THRESHOLD requests
// to fail, otherwise the oldest failures age out before the count is ever reached.
// A request that exhausts its retries and then falls back takes a few seconds.
export const FAILURE_WINDOW_MS = 60_000
export const COOLDOWN_MS = 30_000

export type BreakerState = "closed" | "open" | "half-open"

export type BreakerSettings = {
  failureThreshold: number
  windowMs: number
  cooldownMs: number
  now?: () => number
}

export type Breaker = {
  state: () => BreakerState
  tryPass: () => boolean
  recordSuccess: () => void
  recordFailure: () => void
  abandon: () => void
}

export const DEFAULT_BREAKER_SETTINGS: BreakerSettings = {
  failureThreshold: FAILURE_THRESHOLD,
  windowMs: FAILURE_WINDOW_MS,
  cooldownMs: COOLDOWN_MS,
}

export function createBreaker(settings: BreakerSettings = DEFAULT_BREAKER_SETTINGS): Breaker {
  const now = settings.now ?? Date.now

  let failures: number[] = []
  let openedAt: number | null = null
  let probing = false

  function state(): BreakerState {
    if (openedAt === null) return "closed"
    if (now() - openedAt < settings.cooldownMs) return "open"
    return "half-open"
  }

  function close(): void {
    failures = []
    openedAt = null
    probing = false
  }

  return {
    state,

    tryPass(): boolean {
      const current = state()
      if (current === "closed") return true
      if (current === "open") return false
      if (probing) return false

      probing = true
      return true
    },

    recordSuccess(): void {
      close()
    },

    recordFailure(): void {
      probing = false

      if (openedAt !== null) {
        openedAt = now()
        failures = []
        return
      }

      const cutoff = now() - settings.windowMs
      failures = failures.filter((at) => at > cutoff)
      failures.push(now())

      if (failures.length >= settings.failureThreshold) {
        openedAt = now()
        failures = []
      }
    },

    abandon(): void {
      probing = false
    },
  }
}
