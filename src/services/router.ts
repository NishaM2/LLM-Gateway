import { createBreaker, type Breaker, type BreakerState } from "../lib/circuitBreaker.ts"
import { BASE_DELAY_MS, MAX_ATTEMPTS, retry } from "../lib/retry.ts"
import type { ModelRoute, ModelTarget, ProviderName } from "../models.ts"
import type { Providers } from "../providers/registry.ts"
import { ProviderError, type ProviderReply } from "../providers/types.ts"

export type RouteOutcome = {
  reply: ProviderReply
  target: ModelTarget
  attempts: number
  usedFallback: boolean
}

export type RouteCall = {
  body: Record<string, unknown>
  stream: boolean
  signal?: AbortSignal
}

export type RouteEvents = {
  onAttempt?: (target: ModelTarget, attemptsSoFar: number) => void
  onWait?: (target: ModelTarget, waitMs: number, error: unknown) => void
  onFallback?: (from: ModelTarget, to: ModelTarget, error: unknown) => void
  onSkip?: (target: ModelTarget, state: BreakerState) => void
  onBreakerOpened?: (target: ModelTarget) => void
}

export type Router = {
  send: (route: ModelRoute, call: RouteCall, events?: RouteEvents) => Promise<RouteOutcome>
  breakerState: (provider: ProviderName) => BreakerState
}

export function createRouter(providers: Providers): Router {
  const breakers = new Map<ProviderName, Breaker>()

  function breakerFor(provider: ProviderName): Breaker {
    const existing = breakers.get(provider)
    if (existing) return existing

    const fresh = createBreaker()
    breakers.set(provider, fresh)
    return fresh
  }

  return {
    breakerState(provider: ProviderName): BreakerState {
      return breakerFor(provider).state()
    },

    async send(route: ModelRoute, call: RouteCall, events: RouteEvents = {}): Promise<RouteOutcome> {
      let attempts = 0
      let lastError: unknown

      for (const [position, target] of route.entries()) {
        const breaker = breakerFor(target.provider)

        if (!breaker.tryPass()) {
          events.onSkip?.(target, breaker.state())
          lastError = circuitOpenError(target)

          const next = route[position + 1]
          if (!next) throw lastError
          events.onFallback?.(target, next, lastError)
          continue
        }

        const wasClosed = breaker.state() === "closed"

        try {
          const reply = await retry(() => providers[target.provider].send({ model: target.model, ...call }), {
            attempts: MAX_ATTEMPTS,
            baseDelayMs: BASE_DELAY_MS,
            signal: call.signal,
            onAttempt: () => {
              attempts += 1
              events.onAttempt?.(target, attempts)
            },
            onWait: (_attempt, waitMs, error) => events.onWait?.(target, waitMs, error),
          })

          breaker.recordSuccess()
          return { reply, target, attempts, usedFallback: position > 0 }
        } catch (error) {
          lastError = error

          if (blamesProvider(error)) {
            breaker.recordFailure()
            if (wasClosed && breaker.state() === "open") events.onBreakerOpened?.(target)
          } else {
            breaker.abandon()
          }

          const next = route[position + 1]
          const worthTryingAnother = error instanceof ProviderError && error.fallbackable
          if (!next || !worthTryingAnother) throw error

          events.onFallback?.(target, next, error)
        }
      }

      throw lastError
    },
  }
}

function blamesProvider(error: unknown): boolean {
  if (!(error instanceof ProviderError)) return false
  return error.code !== "request_rejected" && error.code !== "caller_hung_up"
}

function circuitOpenError(target: ModelTarget): ProviderError {
  return new ProviderError({
    status: 503,
    code: "provider_circuit_open",
    message: "The provider is temporarily unavailable.",
    detail: `Skipped ${target.provider} because its circuit breaker is open`,
    retryable: false,
    fallbackable: true,
  })
}
